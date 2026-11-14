# Camera accessibility device test checklist

Automated tests cover semantics and state changes, but they cannot reproduce mobile screen-reader timing, camera permission sheets, speech queues, or a physical refreshable Braille display.

## iPhone with VoiceOver

1. Connect the iPhone and Mac to the same private network or phone hotspot, start the HTTPS phone server, and accept the local certificate warning.
2. Turn on VoiceOver before opening the app. Leave **Spoken camera guidance** off for the first pass.
3. Confirm every control has one clear announcement and the status region announces camera, capture, OCR, page, translation, and reading changes once.
4. Activate **Use camera**. Confirm focus moves to **Take photo now** and automatic guidance does not trap VoiceOver focus.
5. Test manual and automatic capture, a blurry page, a clipped page, denied camera permission, and an OCR failure.
6. Scan two pages. Confirm **Previous scanned page** and **Next scanned page** restore each page's edited text and Braille result. These controls must remain distinct from the three-cell Braille preview pagination.
7. Start reading, pause, resume, switch scanned pages, then return. Confirm reading resumes near the prior word boundary when restarted.
8. Turn on **Spoken camera guidance** and confirm it does not speak over VoiceOver or active read-aloud speech. Turn it off again and confirm all information remains available through VoiceOver and visible text.
9. If available, connect a refreshable Braille display and verify the current textual status and controls. Do not describe the workflow as fully DeafBlind accessible until this tactile-output pass succeeds.

iOS Safari does not implement the standard Web Vibration API. The app must show vibration as unavailable on iPhone and must not use hidden controls, audio tricks, or other nonstandard substitutes.

## Android with TalkBack

Repeat the same workflow in current Chrome with TalkBack. Also confirm vibration is present when enabled, absent when disabled, and never the only indication of a state change. Android/device policies may ignore Web Vibration API requests.

## Record during testing

- Device, OS, browser version, and screen-reader version.
- Whether each status was missing, duplicated, delayed, or interrupted.
- Focus location after opening the camera, completing OCR, changing scanned pages, and closing permission prompts.
- Camera framing guidance that was inaccurate for the surface, lighting, or page orientation.

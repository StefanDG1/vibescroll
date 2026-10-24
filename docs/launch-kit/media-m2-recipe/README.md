# Reproduce the prepared M2 edits

These are edited synthetic candidate captures from October 22, 2026, source commit `76ec7bf0b9812e670207cba199b8d07cc07839fd`. They illustrate reading, manual Save, a private issue draft and no-fit decisions. They establish no live processing, implementation plan, customer result, current provider capability or measured latency.

Root High reviewed six representative exported frames for prepared integration. Native playback, final integrated review and CI remain pending. This is not production or social-posting approval.

## Historical input

`sources/overview-76ec7bf.mp4` preserves the exact historical synthetic source, SHA-256 `a4b2709e931e1286d68646592486f1cf4be99b42e9b2efee5d6b4508fa6d1820`. It is a deprecated reproduction input, not an application asset. Its old issue-draft scene incorrectly says "plan" in the caption band. The generator extracts only the native top 390x700 UI region, discards that old caption band, and composes accurate issue-draft captions. Do not use the archived video as plan proof or marketing playback.

Other inputs are the existing approved PNGs under `apps/starter/public/help` and `apps/starter/public/product`. `source-assets.json` binds every input to its approved hash and provenance. The generator fails before rendering on a mismatched input. No private Reel, founder-result crop, generated UI, voice or music is used. The 90-second setup walkthrough is preserved separately.

`sources/setup-76ec7bf.mp4` also archives the exact historical 90-second setup input, SHA-256 `94da2151b29b1406bc6b1dd10cc2f52ca4714f0772e86e476a082b24cb7f40a0`. Its final embedded caption has the same inaccurate "plan" terminology. It is deprecated reproduction input and is not served by the application. `repair-setup.py` prepares a correction limited to the final ten seconds' caption band, y = 720 through 839. The original UI region is 1280x720; the complete frame is 1280x840. Sequence and 90-second timing stay the same. A consistent H.264 re-encode changes compression pixels, so the result is not claimed to be bit-identical. Root must inspect the actual corrected 82-second frame before replacing the public video.

## Run offline

Use an existing FFmpeg/ffprobe installation with H.264 and VP9 encoders, Python 3 and Pillow. No package installation or download is performed. Choose an existing licensed local font; the font is neither copied nor distributed.

From the repository root, for example on Windows:

```powershell
python docs/launch-kit/media-m2-recipe/render.py --output outputs/launch-run/media-m2-reproduction --font "$env:WINDIR/Fonts/segoeui.ttf"
python docs/launch-kit/media-m2-recipe/repair-setup.py --output outputs/launch-run/setup-caption-reproduction --font "$env:WINDIR/Fonts/segoeui.ttf"
```

To reproduce only the three families' captions, transcripts and plain-text storyboards without invoking FFmpeg or re-encoding any video:

```powershell
python docs/launch-kit/media-m2-recipe/render.py --text-only --output outputs/launch-run/media-m2-text-verification
```

All generated text uses UTF-8 without a BOM and explicit LF line endings, including on Windows. The nine generated text alternatives map to their public destinations in `public-paths.json`. Compare those bytes before updating the current asset ledger; archived source history remains unchanged.

On another operating system, pass the path to an existing local font. The application output directory is constrained to this checkout's ignored `outputs` directory. Rendering is serial, with two decoder/encoder threads and one filter thread, including source frame extraction. Captions use separate single-line overlays to avoid newline glyphs seen in the inspected Windows FFmpeg build.

The editable scene definitions and filters are in `render.py`. It produces six presentation edits: product 40 seconds, Library 24 seconds and social 20 seconds, each desktop/mobile, with H.264 MP4, VP9 WebM, extracted posters, captions, transcripts, static storyboards and a hash manifest. `public-paths.json` maps generated basenames to the current reviewed application destinations. It does not copy or publish those files.

Desktop presentations preserve complete source captures through scaling and letterboxing. Mobile preserves the original 390-pixel width and adds a caption band; the Library presentation is taller to preserve its 900-pixel source capture. These are editorial presentations, not native social-platform acceptance. The smaller H.264 files are primary; the prepared VP9 alternatives are larger at the chosen conservative settings.

Reproduction with another font or FFmpeg version may change bytes and text layout. Review actual exported frames and native playback, verify durations/decoding/hashes, and update the asset ledger before replacing any public files. No generated output is automatically approved or published.

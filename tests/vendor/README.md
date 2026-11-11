# Reviewed CI source archive

`ffmpeg-9.0.2.tar.xz` is the unchanged upstream FFmpeg source archive from the URL recorded in `tests/media-tools.lock.json`. Its exact length and SHA-256 are checked before extraction or compilation. The existing lock records the independently verified detached signature and published signer fingerprint.

This archive retains all upstream copyright and licence notices, including the `COPYING.*` files inside it. FFmpeg source contains LGPL and GPL components under their respective upstream terms; the repository's MIT licence does not relicense this archive. It builds only the existing minimal, network-disabled synthetic-media CI toolchain. It is not the production media runtime or a new binary distribution.

The November1 CI download host repeatedly timed out before tests could run. Retaining the already reviewed 12,040,788-byte source removes that network prerequisite. Do not replace the archive, hashes, source version or build flags merely to bypass an integrity failure.

# Branding dependencies

Phase 7 adds pinned local dependencies for exact artwork; it does not use remote font services.

- `@fontsource/inter` 5.3.0: Inter Latin 400/700 normal WOFF files. Copyright 2016 The Inter Project Authors. SIL Open Font License 1.1, retained in the installed package's LICENSE. The UI aliases are Darkroom Sans and Darkroom Sans Bold; the font files are unmodified. Sources: https://github.com/rsms/inter and https://github.com/fontsource/fontsource.
- `opentype.js` 2.0.0: MIT-licensed font parsing and glyph outlines, https://github.com/opentypejs/opentype.js. The application uses explicit limited Latin glyph placement and pair kerning rather than unvalidated complex-script substitution.
- `saxes` 6.0.0: ISC-licensed XML parsing, https://github.com/lddubeau/saxes. Application-level SVG element/attribute restrictions reject active or unsupported content.
- `@types/opentype.js` 1.3.8: development-only MIT typings from DefinitelyTyped. The actual Node runtime import and application-used API are tested against 2.0.0.

The lockfile pins dependency integrity. Fonts load from the installed local package; missing or unsupported fonts fail rather than substituting system fonts. Glyph paths are used for screen and delivery rendering. Native files carry font identities; imports reject mismatches for text layers. No font binaries are copied into the Git repository or embedded in the SVG handoff.

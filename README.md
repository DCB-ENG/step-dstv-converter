# STEP / DXF to DSTV converter — experimental browser preview

12 November 2026 reviewed update: staged STEP previews, adaptive stock recognition
and faster section checks; black/silver/orange controls; filename-derived part
marks linked to SI text; SI face/X/Q help; steel-grade presets/custom entry; and
a clear Replace file button. Eligible imported I-root/end trim approximations
have a separate bounded 0.50 mm allowance while the normal mitre comparison stays
at 0.02 mm by default. Software verification and machine acceptance remain separate.

## [Open converter](https://dcb-eng.github.io/step-dstv-converter/)

Use the converter online — no installation or GitHub account required.

This repository contains the prebuilt browser app and its dependency notices.
STEP solids and selected DXF plate outlines are processed in the visitor's browser,
in a dedicated WASM worker.
No server-side conversion, file-upload service or database is used.

Supported geometry and provenance limits are in [SOURCE-NOTICE.md](SOURCE-NOTICE.md).
Output is experimental; software checks and ProCAM/machine acceptance are separate.
This is a user-maintained preview, separate from the official SolidCraft website.

## Supported conversion paths

- STEP: axis-aligned RHS/SHS, PFC, angle or symmetric parallel-flange I solids.
  Round holes, bounded angle edge slots, simple/compound planar I mitres and
  full-width square-end I copes are supported within the documented geometry
  limits. STEP automatically
  checks section and flat-plate geometry; ambiguous or unsupported solids refuse output.
- STEP assemblies: up to 16 solid occurrences, including nested rigid product
  placements. Each member is retained, reviewed and verified independently in
  its part frame, with individual NC1 and complete ZIP output. Unsupported members
  remain listed and block complete ZIP export. Occurrences stay separate;
  assembly quantity grouping and non-rigid/mirrored placements are refused.
- Recognition: rounded angle toes at half the leg thickness use complete boundary
  curves to disambiguate coincident corner circles. Failures retain per-axis
  geometry diagnostics, and the preview stays beside the measured dimensions.
- Plates: one constant-thickness STEP solid or explicitly selected 2D ASCII DXF
  cutting layers, with line/arc outlines, round holes and internal through-cuts.
  DXF shows a drawing preview before checks, with detected cutting-layer checkboxes.
  Confirm units, cutting layers and thickness before checking cutting geometry.
  Plate limits are 400 mm diagonal, 512 faces, 2048 edges and 512 analytic spans.
  Plate records use 2-5 decimal places as needed
  inside fixed columns, with the same total 0.002 mm geometry check.
- DXF batches: up to 16 disjoint plates, with a numbered layout, separate origin
  confirmations and individual NC1/ZIP download. Matching unmarked parts can be
  explicitly combined with detected quantities. Full contours, holes and thickness
  must match, and every occurrence is rechecked. Keep separate is the default.
- Machining additions: explicit SI text / closed PU contour marking, standard
  obround and rectangular through-holes, and bounded flat-wall notches/windows.
  The newer section-cut route needs an intact square stock end and a maximum
  400 mm body diagonal. Unknown, blind, bevelled or ambiguous cuts remain blocked.
- I copes: top/bottom flange copes at either/both square ends, with sharp or
  tangential circular reliefs. Partial-width, shallow flange-only, stepped,
  blind, bevelled and combined mitre/cope cuts are refused.
- Tube end profiles: a measured RHS/SHS stock frame and four H/U/V/O projected
  exterior envelopes, including corners, in ProCAM mode. Whole-curve/subdivision
  bounds and rounded records must fit the bounded 0.25 mm projection allowance. End-wall
  bevel angles are not encoded; strict output refuses the non-V external cuts.

The converter checks the current imported solid before output. Plate, I-mitre
and I-cope output also reconstructs actual rounded NC1 geometry. Unsupported or
ambiguous geometry blocks export. Material/job details and the coordinate frame
require operator review; geometry does not identify the material grade.

The 5 November 2026 coordinate correction follows the DSTV seventh-edition
piece frame. RHS top/under coordinates measure from back toward front; channels
and angles use one common piece X, and angle U uses the outside working face.
The preview exposes each face's zero point and positive directions. Dimension
references, signed arcs and contour winding follow the same mapping. Historical
Fusion mapping is preserved locally as unverified regression evidence.

Software verification for the reviewed 9 November 2026 release includes
VERIFY_PROJECT.ps1 (37 Python tests, all 111 native section builds and protected
baseline/upstream checks), all 79 native converter tests and the complete
independent export, JavaScript and WASM regression suites. Twenty compound I-end
and six assembly native/WASM byte comparisons passed. Half-thickness angle
strict/ProCAM outputs match independently calculated complete NC1 references;
actual browser downloads match those references. Automatic input classification,
confirmation gates, unsupported-geometry refusal and the previously accepted
Base Main reference remain verified. The final preview layout passed camera-fit
and visual checks. These are software results; new ProCAM/machine acceptance
remains pending.

## Publish with GitHub Pages

In this repository's Settings > Pages, select **Deploy from a branch**,
then **main** and **/(root)**. Save and wait for the Pages deployment to finish.
The empty `.nojekyll` file keeps the prebuilt assets unchanged.

Open the published HTTPS URL, wait for WASM ENGINE READY, load an analytic
sample, confirm its orientation, enter a grade and download a test NC1.

## Update

Build and verify the converter in the separate SolidCraftDSTV development project.
Prepare a fresh deployment bundle, then commit its site files here. The
`bundle.json` manifest records SHA-256 for each original browser asset.
Keep all notices and the pkg/ folder. Do not add customer STEP/NC1 files or
workshop reference data to this deployment repository.

Build and GitHub Pages instructions are documented in
https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

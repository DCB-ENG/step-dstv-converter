# STEP / DXF to DSTV converter — experimental browser preview

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

- STEP: one axis-aligned RHS/SHS, PFC, angle or symmetric parallel-flange I solid.
  Round holes, bounded angle edge slots, simple I mitres and full-width square-end
  I copes are supported within the documented geometry limits.
- Plates: one constant-thickness STEP solid or explicitly selected 2D ASCII DXF
  cutting layers, with line/arc outlines, round holes and internal through-cuts.
  DXF needs explicit units, exact layer names and positive thickness. The initial
  plate limit is 400 mm diagonal. Plate records use 2-5 decimal places as needed
  inside fixed columns, with the same total 0.002 mm geometry check.
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

Software verification passed 58 native converter tests, with focused final
winding/frame checks, eight independent standard-coordinate cases, their WASM
comparisons and four managed-native coordinate round trips. VERIFY_PROJECT.ps1
passed 37 Python tests and all 111 native section builds. Five actual local
browser downloads matched native bytes. These are software results;
real ProCAM/machine acceptance remains outstanding.

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

# STEP / DXF to DSTV — experimental browser converter

This is a user-maintained preview, separate from the official SolidCraft website.
It processes files locally in a browser worker. No conversion backend or file
upload service is included. Publication to SolidCraft upstream requires separate
authorisation and an independent provenance review.

## Runtime, provenance and licences

The geometry runtime uses the existing public API of SolidCraft v0.23.0,
commit 7770f8982de8bf00cabfe421b7f563b34c7af90f. The pinned STEP reader and kernel
are unmodified. Their licences and third-party notices remain bundled. The
THIRD-PARTY-LICENSES.txt inventory is the upstream distribution's full inventory,
a superset of this smaller kernel-only build's dependencies.

I-section name verification embeds 41 UB/UC dimension records (28 UB, 13 UC)
derived from the SteelInfo Australia public DXF catalogue, https://steelinfo.au/.
Its [terms](https://steelinfo.au/terms/), checked 3 November 2026, permit
incorporating its data/drawings in software. Names are accepted only when measured
depth, width, flange/web thickness and root radius agree. This is nominal
identification, not certification of the member or material.

The restricted Rust writer is a separate port. Existing section compatibility
checks use a preserved Python writer as a local oracle; that baseline is
unchanged and is not an I-section or plate oracle. New I, mitre, plate and cope
cases have independent analytic expectations. This compatibility provenance is
not claimed to satisfy upstream independence rules. No blanket licence for the
older FusionDSTV package is assigned here.

Format reference: Deutscher Stahlbau-Verband, July 1998, seventh edition,
"Standard description for steel structure pieces for the numerical controls":
https://www.tktn.com/prosteel/defects/DSTV%20Format.pdf

STEP exchange syntax, ISO 10303-21, public editor-hosted edition:
https://steptools.com/stds/step/IS_final_p21e3.html

DXF cutting entities follow the public Autodesk DXF reference. A separate strict
ASCII reader is used because the pinned display reader defaults units and can
omit unsupported entities/layer provenance. No additional DXF parser dependency
was introduced.

All built-in samples use independent analytic dimensions, not customer CAD or
commercial-CAD-generated reference files. The prebuilt deployment excludes
customer STEP/NC1 files, workshop records and development/upstream checkouts.

## Shared geometry and output rules

One supported solid per STEP conversion, at most 10 MiB, 512 imported faces and
a 10 m body diagonal. Stock axes must align with selected perpendicular signed
world axes. Importer warnings, unknown surfaces, assemblies, unaccounted cuts
and ambiguous recognition block export. Arbitrary stock rotation, CHS, tapered
or asymmetric I sections, blind machining and bevels remain outside this slice.

The converter recognises current analytic surfaces and complete trim boundaries,
reconstructs the stock and supported machining, and compares both directions.
Meshes provide topology indices and display only. Ordinary square-section and
cope comparison uses 0.002 mm; the inherited whole-curve projection bound is
reported separately. It must not be interpreted as a tighter total machine
accuracy. Plate and mitre budgets below use their separately documented bounds.

Strict DSTV and ProCAM compatibility remain explicit separate modes. Fixed-width
ASCII/CRLF, reserved face/reference columns, signed radii and closed contours
are preserved. Grade, quantity, mark, designation and working direction require
operator review. No kerf, trim allowance or material grade is inferred.

RHS/SHS strict output uses the single V-face M-profile outline and refuses an
unrepresentable non-V cut. Compatibility output uses one outline per physical
tube face. Outside-radius metadata is tube-only. Channels retain V/O/U working
faces. Angles retain V/U, with U X = length minus model X and mirrored arc signs.
Up to sixteen separate round drills and sixteen bounded angle edge slots are
supported; enclosed section pockets and other unrecognised cuts are refused.

## Symmetric I sections and simple mitres

Square I stock uses an I header, measured flange/web thicknesses and root radius,
V/O/U AK contours and separate web/top/bottom BO holes. V q rises from the nominal
bottom stock edge; O/U q runs from +Y toward -Y. All faces share the same X datum;
the angle U mirror does not apply. References are u on V and s on O/U in both
modes. Markings, grade and nominal mass are not recovered from STEP.

Simple planar I mitres at either or both ends extend through 65 degrees from
square. Restricted rational spline roots and bounded small end remnants have
whole-net/curve checks. Compound mitres and weld preparations remain unsupported.
The total mitre comparison allowance is adjustable from 0.002 to 1.000 mm,
default 0.020 mm. Larger values permit larger discrepancies. Source geometry and
actual rounded NC1 must pass the same selected allowance, including projection
and curve uncertainty; non-default output records the setting in a comment.

Pure supported mitres use signed header angles and finished overall X extent,
without redundant AK or inferred saw allowance. An analytic ruled reconstruction
is used where a plane-cut Boolean was insufficiently accurate for rounded roots.

## Flat plates from STEP or DXF

One flat constant-thickness plate with an external line/arc outline, round
through-holes and closed internal through-cuts. Initial budgets are 400 mm body
diagonal, 0.1-200 mm thickness smaller than both broad-face spans, 256 faces,
1024 edges, 512 analytic spans and 32 internal loops. STEP requires two unsplit
parallel broad faces. Bevels, countersinks, blind pockets and unsupported curves
are refused.

ASCII DXF is limited to 2 MiB and 256 selected entities: LINE, ARC, CIRCLE and
closed 2D LWPOLYLINE with signed bulges. Units (mm/inch), exact cutting layer and
positive thickness must be supplied; present nonzero INSUNITS must agree.
Unknown selected entities/groups, gaps, crossings, touching loops, nested islands,
nondefault OCS, elevation and wide polylines block conversion. Other layers are
excluded by the operator's explicit cutting-layer selection.

Selected drawing curves are checked against the constructed thickness-aware
solid. Both input paths then use the same geometry-backed B-profile output:
length/enclosing width, zero flange dimensions, web field = plate thickness,
and local designation PLthickness*width. V is toward -Y; X/q start at the minimum
X/up of the enclosing rectangle. AK is counterclockwise. Strict IK is clockwise
with explicit first-row references; compatibility IK retains counterclockwise
winding and no first-row suffix. Round holes use BO.

Both projection bounds and comparison errors share the total 0.002 mm plate
budget. Actual two-decimal NC1 is decoded, rebuilt and compared before download;
excessive rounding loss blocks output. This does not add plate NC1 import,
nesting, bending or sheet-metal unfolding.

## Full-width I end copes

At most four copes: top and/or bottom flange at either/both square ends, retaining
an intact common middle section. Back walls/floors are straight; explicit inside
reliefs are tangential quarter circles with radius at least 0.5 mm, or sharp
corners. Cuts must clear section roots and leave a supported web. Two copes at
one end leave more than 1 mm of web, and the common intact middle band is longer
than 2 mm. Setback exceeds relief radius by more than 1 mm. These are software
limits, not structural design rules. Drills clear every cope X interval by more
than 1 mm, including their radius.

Partial-width, shallow flange-only, stepped, drill-style corner-relief, bevelled
and combined mitre/cope cuts are refused. Stock, all roots, copes and drills must
match the complete current B-rep. Local machining windows reduce long-member
Boolean drift. Shaped V AK and shortened O/U AK preserve their shared nominal
datum; explicit finished arcs do not invent t/w notch-tool instructions. Actual
rounded V/O/U AK and BO are decoded and reconstructed before output.

## Viewer and acceptance

Three.js and OrbitControls 0.187.0 (MIT) are vendored locally from the official
npm archive, verified by its published SHA-512 integrity. Their licence and file
hashes are under vendor/three. OrbitControls' module import alone is rewritten
to the adjacent pinned module. Normal use requires no CDN. Camera movement
does not transform the solid, working axes or NC1 frame. WebGL 2 is required.

The 4 November 2026 software checks include 48 native converter tests; original
section parity plus independent I, mitre, plate and cope NC1 expectations;
twelve plate and twelve cope WASM byte comparisons; and actual local browser
downloads matching references. The companion project also passed all 111
original section builds and protected-baseline/upstream integrity checks.

**ProCAM import and machine acceptance of these new output paths remain
outstanding.** Software verification and a compatibility-mode download are not
machine approval. Route compatibility, including RoboRail/XDM-630, is unvalidated.

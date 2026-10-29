# Local STEP → DSTV prototype

This is private development work, not an official SolidCraft release or an
accepted upstream contribution. No upstream submission/publication is authorised.

The geometry runtime uses the existing public API of SolidCraft v0.23.0,
commit 7770f8982de8bf00cabfe421b7f563b34c7af90f, in the separate local checkout.
The STEP reader/kernel are unmodified by this converter. SolidCraft and its
permissive third-party dependencies retain their own licences and notices.
The copied THIRD-PARTY-LICENSES.txt is the upstream distribution's full notice
inventory, a superset of this smaller kernel-only build's dependencies.

The converter contains no stock catalogue. Its samples use independently chosen
analytic dimensions: RHS 150×100×6, L=350, Ro=12; PFC 160×80, tf=10, tw=7,
L=450, root=12, toe=3; EA 90×90×8, L=400, root=10, toe=3; UA 150×90×10,
L=450, root=12, toe=4. Round drills are independently positioned and built
and exported with SolidCraft. The asymmetric slot sample uses separate analytic
semicircle cutters. No
commercial-CAD-generated fixture or ProCAM catalogue is included.

Format reference: Deutscher Stahlbau-Verband, July 1998, 7th edition,
"Standard description for steel structure pieces for the numerical controls":
https://www.tktn.com/prosteel/defects/DSTV%20Format.pdf
STEP exchange syntax: ISO 10303-21, public editor-hosted edition:
https://steptools.com/stds/step/IS_final_p21e3.html

The restricted Rust writer is a separately documented port. Local parity checks
use the preserved Python writer as a compatibility oracle. Strict mode and the
previously confirmed workshop ProCAM conventions remain separate. That historical
compatibility provenance is not claimed to satisfy upstream independence rules;
an upstream proposal needs a separate source/fixture and licensing review.
No blanket licence for the older FusionDSTV package is assigned here.

This prototype recognises one axis-aligned RHS/SHS, parallel-flange channel,
equal-angle or unequal-angle closed solid, square ends, consistent section
dimensions/rounded corners, at most 16 separate round wall/web/flange/leg holes,
and up to 16 separate rounded angle edge slots.
It compares every current analytic support and its complete line/arc trim-boundary
coverage with a reconstructed member, in both directions, at 0.002 mm comparison
tolerance. The kernel's inherited whole-curve projection bound is reported and
limited to 0.01 mm by a 10 m body-diagonal cap. Unknown/freeform surface records,
importer warnings and any unaccounted geometry block export.
Orientation, material grade, quantity and part mark must be confirmed by
the operator; they are not inferred from solid geometry.
ProCAM and machine acceptance have not been performed.

Open-profile face conventions retain the documented workshop rules: PFC V is
the inside web, O/U are separate flanges; angle V is the vertical/longer leg,
U is the horizontal leg and U-cut X equals length minus model X, with mirrored arc signs. The detected
heel/web side determines the transverse references, including after a reversal
of member direction. The preview shows those actual working faces and their
reference origins, and reverses the angle U origin/direction.
Recognised edge slots are shaped AK contours. Other cutting contours, enclosed
slots and mitres remain unsupported and are refused. B5 is used only from the
user-supplied local path; its STEP is not bundled or published.

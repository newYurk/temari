# Thread over thread: textile-engineering evidence (raw)

Raw output of the 23.09.2026 research run (four source sweeps, a synthesis, an adversarial re-check against the primary sources). Code snapshot compared: `85c96cd`. The Russian summary and the numbers the model should use are in [docs/thread-over-thread.md](../docs/thread-over-thread.md); where the synthesis and the check disagree, **the check (section 3) wins**.

Labels: SAYS = the source states it; COMPUTED = derived here. Nothing below is measured on pearl #5 or on a mari.

## 1. Source sweeps

### 1.1. Woven fabric geometry: Peirce 1937 (circular and elliptic threads), Kemp 1958 racetrack, Hamilton 1959/1964, Hearle–Shanahan 1978 lenticular, and measured yarn flattening in fabrics (cotton and twisted filament). Applied to a pearl cotton #5 thread crossing another on a wrapped temari ball.

**1.1. Peirce's plain-weave geometry (circular, incompressible threads). At a crossover the axes of the two threads are separated by half the sum of their diameters, and the crimp heights of the two thread systems add up to that sum.**

- Numbers: h1 + h2 = d1 + d2 = D (eq. 9). The axis-to-axis gap at contact is D/2, which equals d for two identical threads. Remaining relations: c = l/p - 1; p2 = (l1 - D*theta1)cos(theta1) + D sin(theta1); h1 = (l1 - D*theta1)sin(theta1) + D(1 - cos(theta1)). All lengths in the same unit (mm or cm).
- Source: SAYS: Behera, Militky, Mishra, Kremenakova, 'Modeling of Woven Fabrics Geometry and Properties', InTech 2012, eqs. 3-9. The chapter prints eq. 9 as "d1+d2=h1+h2=D". https://cdn.intechopen.com/pdfs/36900/intech-modeling_of_woven_fabrics_geometry_and_properties.pdf (primary paper: Peirce, J Text Inst 28 T45, 1937, https://www.tandfonline.com/doi/abs/10.1080/19447023708658809, paywalled and not read)
- Confidence: high (standard textbook formula; read in the secondary source, not in Peirce's original)

**1.2. Flattened threads. Peirce's elliptic section and Kemp's racetrack section both keep the same crossover rule, but with the minor diameter (thickness) b in place of the round diameter. The ellipse's equivalent round diameter is taken as the geometric mean of its axes. Hamilton's limiting racetrack geometry reduces the effective major diameter.**

- Numbers: Elliptic section: flattening factor e = b/a (minor axis over major axis), d = sqrt(a*b), h1 + h2 = b1 + b2 (eq. 19). Racetrack section (Kemp 1958): h1 + h2 = B = b1 + b2; p' = p - (a - b); l' = l - (a - b); h1 = (4/3) p2' c1'. Hamilton's limiting case: a' = a - 0.1b (twill-type weaves) or a' = a - 0.215b (weaves with floats on both sides). Fabric thickness for flattened threads = the larger of h1 + b1 and h2 + b2. For a balanced fabric: minimum thickness = D (circular) or B (flattened).
- Source: SAYS: the InTech chapter (link above), sections 2.2.5.1-2.2.5.2 and 2.3.1. It says inter-yarn pressure "results in considerable yarn flattening normal to the plane of the cloth". Also Galuszynski, Indian J Text Res 12:71-77 (1987), Fig. 2, "Kemp's racetrack model of flattened yarn", and eqs. 2.7-2.8 citing Hamilton 1964. https://nopr.niscpr.res.in/bitstream/123456789/32755/1/IJFTR%2012(2)%2071-77.pdf. Kemp's original: J Text Inst 49 T44 (1958), https://www.tandfonline.com/doi/abs/10.1080/19447025808660119 (paywalled, not read).
- Confidence: high for the formulas

**1.3. Measured: the thickness of a woven fabric roughly equals the sum of the minor (vertical) diameters of the warp and weft at the crossover. Thickness is linear in the minor diameters. This is the empirical basis for 'the stack at a crossover = sum of the flattened heights'.**

- Numbers: Plain-weave polyester multifilament fabrics (300 den/96 f yarn twisted to alpha_tex 0-4600; 25 ends/cm, 23 picks/cm). Fabric thickness measured to ASTM D1777. The paper reports thickness ≈ b_warp + b_weft and a linear relation (its Fig. 6).
- Source: SAYS: Afrashteh, Merati, Jeddi, IJFTR 38:126-131 (2013): "fabric thickness is approximately equal to the sum of the minor diameter" of warp and weft. https://nopr.niscpr.res.in/bitstream/123456789/19249/1/IJFTR%2038(2)%20126-131.pdf
- Confidence: medium-high (measured, but on twisted polyester filament, not cotton)

**1.4. Twist controls the flattening ratio. Untwisted yarn at a crossover becomes a lens, moderate twist gives an ellipse, and high twist stays nearly circular. The twist of the crossing yarn also changes the other yarn's section: a harder crossing yarn leaves less room for spreading.**

- Numbers: Ellipticity b/a rose from 0.35 (alpha_tex = 0) to 0.86 (alpha_tex = 4600), i.e. width/height fell from about 2.9 to about 1.16. The major diameter shrinks and the minor diameter grows as twist increases. The cross-effect between warp and weft is significant at the 5% level.
- Source: SAYS: Afrashteh et al. 2013 (link above). Abstract and Figs. 2-5, resin-embedded cross-sections measured under a microscope.
- Confidence: medium (measured; filament yarn, so cotton's absolute values will differ)

**1.5. Measured, cotton, crossed but not interlaced ('orthogonal' fabrics, where weft layers lie straight). Stack thickness is the sum of the layer heights, and each yarn's height is well below its round diameter. Relative flattening is larger for fine yarns and smaller for coarse or plied ones. Width was not measured; it was computed assuming the cross-section area is conserved (w*h = d^2).**

- Numbers: Round diameter d = sqrt(tex)/26.7 mm (specific volume 1.1 cm3/g). Height h / d / computed w in mm: 54 tex (2/22s) 0.177 / 0.275 / 0.427 (h/d 0.64, w/h 2.41); 98 tex 0.270 / 0.371 / 0.510 (0.73, 1.89); 146 tex 0.362 / 0.453 / 0.567 (0.80, 1.57); 227 tex 0.477 / 0.564 / 0.667 (0.85, 1.40); 306 tex (4s 2-ply) 0.578 / 0.655 / 0.742 (0.88, 1.28); 336 tex (3-ply) 0.657 / 0.687 / 0.718 (0.96, 1.09). Flattening (d-h)/d = 36, 27, 20, 16, 12, 4 %. The gauge pressure is not stated in the paper.
- Source: SAYS: Panneerselvam, Prakash, Mohamed Zakriya, Raja, Tekstil ve Konfeksiyon 34(2):87-98 (2024), Tables 3-6: "the height of each weft yarn is lesser than its diameter". https://dergipark.org.tr/en/download/article-file/2626159 (article page https://dergipark.org.tr/en/pub/tekstilvekonfeksiyon/article/1169468)
- Confidence: medium (cotton, open data; heights inferred from bulk thickness, width assumed by area conservation)

**1.6. Additivity of stacked crossing layers, measured. Thickness of non-interlaced cotton stacks rises almost linearly with the number of layers, with mild compaction as layers are added.**

- Numbers: All 54 tex yarn: thickness 0.90, 1.24, 1.56 mm for 5, 7, 9 yarn layers, giving a per-layer height of 0.180, 0.177, 0.173 mm (about 4% sublinear from 5 to 9 layers). Coarser wefts, per-layer height derived from the 2, 3, 4 weft-layer fabrics (warp height held at 0.177 mm): 98 tex 0.280/0.281/0.249; 146 tex 0.370/0.387/0.329; 227 tex 0.495/0.494/0.441; 306 tex 0.615/0.591/0.529; 336 tex 0.710/0.681/0.579 mm. That is 10-18% lower at 4 layers than at 2 (part of this may be an artefact of the derivation).
- Source: SAYS: Panneerselvam et al. 2024, Tables 3-5 (link above).
- Confidence: medium

**1.7. Modelling convention for cotton: an elliptical section with b/a = 0.7, sized so that the ellipse's perimeter matches the round yarn's circumference (a + b = 2d). The round diameter comes from Ashenhurst's formula.**

- Numbers: e = b/a = 0.7 for 29.53 tex cotton. d = 1/(K sqrt(N_metric)) with K = 8.3 for cotton. The paper takes the fabric thickness from the warp yarns and assumes warp and weft are in contact.
- Source: SAYS: Turan & Okur, IJFTR 38:251-258 (2013): "the value of flattening ratio was assumed as 0.7". https://nopr.niscpr.res.in/bitstream/123456789/21421/1/IJFTR%2038(3)%20251-258.pdf
- Confidence: medium (an assumed value, validated only indirectly through crimp and mass per area)

**1.8. Round-yarn diameter from linear density, as used in fabric geometry.**

- Numbers: d(cm) = sqrt(Tex) / (280.2 sqrt(phi*rho_f)), with packing phi = 0.65 and rho_f = 1.52 g/cm3 for cotton, which gives d(mm) ≈ sqrt(tex)/28. COMPUTED: for pearl cotton #5 at about 200 tex, d = 0.505 mm (or 0.53 mm with Panneerselvam's sqrt(tex)/26.7).
- Source: SAYS: InTech chapter, eq. after (19) (link above). The worked 200 tex value is my calculation.
- Confidence: high for the formula; the 200 tex input comes from the task

**1.9. Catalogue of cross-section shapes of yarns inside fabrics, and how flattening varies along the yarn.**

- Numbers: Shapes: ellipse (Peirce 1937), racetrack (Kemp 1958), lenticular, i.e. two circular arcs (Hearle & Shanahan 1978, J Text Inst 69:81-100). Cotton grey fabric: circular, elliptic, two-circle or asymmetric-elliptic sections (Alamdar-Yazdi & Heppler, J Text Inst 102(3):248, 2011, as reported by Afrashteh). Along the yarn path the flattening coefficient follows e = a1 + a2 cos(N x). Twist factor mainly controls a1 and a2, and linear density controls N.
- Source: SAYS: Ozgen & Gong, TRJ 81(15):1523-1531 (2011), abstract: "twist factor was found to be the primary factor". https://research.manchester.ac.uk/en/publications/modelling-of-yarn-flattening-in-woven-fabrics/ . Hearle–Shanahan reference: https://www.scirp.org/reference/referencespapers?referenceid=1404002
- Confidence: medium (abstracts only; numeric tables not accessible)

**1.10. The lab method for measuring flattened major and minor diameters under controlled tension is to wind the yarn in touching coils on a spindle. The flattening it produces is described as similar to weaving, package winding, warping and knitting. This is the closest textile analogue to thread wound under tension on a ball.**

- Numbers: No numbers were accessible; the paper is paywalled. Hamilton, J Text Inst 50 T655-T672 (1959).
- Source: SAYS: abstract: "winding the yarn in adjacent coils on to a spindle". https://www.tandfonline.com/doi/abs/10.1080/19447025908659944
- Confidence: high that the method exists; its data were not retrieved

**1.11. COMPUTED: likely laid height (minor axis b) of a single pearl cotton #5 thread lying under tension on the ball.**

- Numbers: d_round = 0.505-0.53 mm. (a) Interpolating Panneerselvam's cotton trend to 200 tex gives h/d ≈ 0.83, so b ≈ 0.42-0.44 mm. (b) Turan–Okur convention (e = 0.7, perimeter conserved) gives b ≈ 0.42-0.44 mm and a ≈ 0.59-0.62 mm. (c) Taking the TemariKai laid width 0.714 mm as the major axis a with area conserved gives b ≈ 0.36-0.39 mm and w/h ≈ 1.8-2.0. This is a lower bound on b, because the gauge width includes gaps and hairiness. (d) High-twist limit (b/a = 0.86) gives b ≈ 0.47-0.49 mm. Range b = 0.36-0.47 mm, central about 0.42 mm; width/height about 1.2-2.0, central about 1.4.
- Source: COMPUTED from the formulas and data in the findings above. No source measures pearl cotton.
- Confidence: low-medium

**1.12. COMPUTED: how far the upper thread's axis rises where it crosses a lower thread on the ball, using Peirce/Kemp applied to a straight lower thread lying on the ball.**

- Numbers: Rigid surface: rise = b2,x + (b1,x - b1)/2, where ',x' means flattened at the crossing. The stack thickness at the crossing is b1,x + b2,x. With b ≈ 0.42 mm and 0-20% extra crossing compaction, the rigid-surface rise is ≈ 0.30-0.42 mm. Subtract the lower thread's indentation delta into the soft wrap; delta is not covered by any source in this family, and I guess 0-0.1 mm. Estimated rise ≈ 0.25-0.42 mm, central about 0.33 mm, i.e. about 0.65 d_round or about 0.8 b.
- Source: COMPUTED (Peirce/Kemp h1 + h2 = b1 + b2 with h2 = 0 on the ball).
- Confidence: low-medium

**1.13. COMPUTED: a taut, flexible thread passing over a bump of height Δ on a sphere of radius R leaves the surface tangentially. This sets the length of the lifted zone, the kink angle at the crossing, and the normal force there (the Peirce/Kawabata crossover force for flexible threads). Bending stiffness is ignored.**

- Numbers: R = 38 mm. L = sqrt((R+Δ)^2 - R^2) ≈ sqrt(2RΔ); phi = arccos(R/(R+Δ)); V = 2T sin(phi) ≈ 2T sqrt(2Δ/R). For Δ = 0.25/0.35/0.45 mm: L = 4.4/5.2/5.9 mm on each side, phi = 6.6°/7.7°/8.8°, V/T = 0.23/0.27/0.31. For T = 0.3-2 N: V ≈ 0.08-0.54 N on a contact patch of about 0.36 mm², i.e. about 0.2-1.5 MPa nominal. A lone thread presses on the ball with only T/R ≈ 0.008-0.05 N/mm, about 11-75 kPa over 0.7 mm width. The gap under the lifted thread shrinks quadratically, ≈ (L - s)^2/(2R), so visually it still 'lies on the ball'.
- Source: COMPUTED (statics and sphere tangent geometry).
- Confidence: medium for the geometry; the tension values are assumptions

**1.14. COMPUTED: several threads crossing at one spot, and nesting.**

- Numbers: Threads crossing at an angle at one point cannot nest, so the rise is about the sum of the crossing-flattened heights. It is mildly sublinear (the orthogonal-stack data suggest 4-18% by 4-9 layers) because V grows roughly as sqrt(stack height), which compresses the lower layers more. Expected n-layer rise ≈ n*b*(0.85-0.97): about 0.33, 0.65, 0.95, 1.25 mm for n = 1-4 (central b_x ≈ 0.33 mm). Nesting happens only against parallel neighbours. A thread lying in the groove between two touching parallel round threads sits 0.866d above their axes instead of d (13% less); flattened threads in a groove lose less.
- Source: COMPUTED, anchored on Panneerselvam 2024 (additivity) and close-packing geometry.
- Confidence: low-medium

**Formulas.**

WHAT THE SOURCES SAY:
(1) Peirce, circular threads: h1 + h2 = d1 + d2 = D; c = l/p - 1; p2 = (l1 - D*theta1)cos(theta1) + D sin(theta1); h1 = (l1 - D*theta1)sin(theta1) + D(1 - cos(theta1)). Axis separation at contact = D/2.
(2) Peirce, elliptic: e = b/a; d = sqrt(a*b); h1 + h2 = b1 + b2.
(3) Kemp racetrack: h1 + h2 = B = b1 + b2; p' = p - (a - b); l' = l - (a - b); h1 = (4/3) p2' c1'. Hamilton limiting case: a' = a - 0.1b or a' = a - 0.215b.
(4) Fabric thickness = max(h1 + d1, h2 + d2) for round threads, or max(h1 + b1, h2 + b2) for flattened threads. Measured: thickness ≈ b_warp + b_weft (Afrashteh 2013).
(5) Yarn diameter: d(cm) = sqrt(Tex)/(280.2 sqrt(phi*rho_f)), about sqrt(tex)/28 mm for cotton (phi = 0.65, rho_f = 1.52). Panneerselvam uses sqrt(tex)/26.7 mm.
(6) Ellipse from a round yarn, two conventions: area conserved (w*h = d^2, used by Panneerselvam) or perimeter conserved (a + b = 2d, used by Turan & Okur).
(7) Orthogonal (non-interlaced) stacks: thickness = sum of the layer heights.

MY COMPUTATION FOR THE BALL:
- Rise of the upper axis at a crossing: Δ = b2,x + (b1,x - b1)/2 - delta_indent.
- Stack thickness at the crossing: b1,x + b2,x.
- Lift-off length: L = sqrt((R+Δ)^2 - R^2) ≈ sqrt(2RΔ).
- Kink angle: phi = arccos(R/(R+Δ)).
- Crossing force: V = 2T sin(phi) ≈ 2T sqrt(2Δ/R).
- Line load of a lone thread on the ball: T/R.
- Groove seat between two touching parallel round threads: 0.866d.
- Numbers for pearl #5 (about 200 tex): d = 0.50-0.53 mm; b ≈ 0.36-0.47 mm (central 0.42); width/height 1.2-2.0; crossing rise ≈ 0.25-0.42 mm (central about 0.33); n layers ≈ n*b_x*(0.85-0.97).

**Gaps.**

1) The primary texts of Peirce 1937, Kemp 1958, Hamilton 1959 and 1964, Ozgen & Gong 2009/2011, Turan & Okur 2012 (TRJ) and Alamdar-Yazdi & Heppler 2011 (cotton grey fabric) are paywalled. I read only secondary summaries or abstracts, so their numeric tables of cotton flattening (a/b) were not retrieved. Hearle, Grosberg & Backer (1969) and Hu (2004) were not accessible.
2) No source in this family measures pearl cotton (mercerised, gassed, high-twist 2-ply). Every pearl-cotton number here is my extrapolation.
3) Panneerselvam 2024 does not state the gauge pressure. Standard fabric thickness testing is typically about 1 kPa (ISO 5084; not verified here). The crossing pressures computed for the ball are about 0.2-1.5 MPa, hundreds of times higher. The fabric-derived heights are therefore probably upper bounds for a loaded crossing, and a transverse compression curve for cotton yarn at 0.1-2 MPa is needed (van Wyk-type law, or Kawabata/KES yarn or crossed-yarn compression). Kim et al., TRJ 2021 measured crossed cotton-yarn compression (https://doi.org/10.1177/0040517520986513, CC BY-NC), but the full text was blocked (HTTP 403), so its numbers were not obtained. That compression data belongs to a different source family.
4) Woven-fabric geometry says nothing about indentation into a soft substrate (the wrapped mari). delta_indent needs a contact or foundation model plus a measurement of the wrap's stiffness.
5) Question 3 (how a wound package grows, and density versus winding tension) is outside this family. The only pointer found is Hamilton 1959: winding on a spindle reproduces package-winding flattening; no data retrieved.
6) The Panneerselvam widths are computed from area conservation, not measured. The TemariKai 7 threads per 5 mm figure includes gaps and hairiness, so it overstates the major axis.
7) Nesting data (Lomov et al. 2003, laminates) were not accessible and concern parallel wavy layers, not point crossings.
8) All rise, force and multi-layer numbers in this report are my own calculations, not published values, and should be checked with a simple physical test: calipers or a photo of 1-4 crossed #5 threads on a wrapped ball, or thread wound on a dowel as in Hamilton's method.

### 1.2. Transverse compression of yarns and fibre assemblies. Covers van Wyk's compression law, how a yarn flattens under load, the contact force where a tensioned yarn crosses another (capstan / Laplace, Kawabata's "wire method"), how compressible cotton pearl and sewing threads are, and thread-thickness gauges. It also includes a small computed crossing model for the mari. The model scripts are in /private/tmp/claude-501/-Users-newyurk-Desktop-Home-Projects-temari--claude-worktrees-temari-needle-spatial-6b5df7/493c3f52-3bb3-466c-bc4c-03d8183c3de0/scratchpad/crossing.py and run2.py in the same folder.

**2.1. SOURCE, and the closest match to our thread: Singal et al. measured how 100% cotton pearl 3/2 compresses (Halcyon 082L). They pressed 30 mm samples between a 5 mm probe and a 5 mm stage, measured force against probe height, and fitted F = A_comp·k·(ρ0/p)·[(ρ0/ρ)^p − 1] over the range 1 mN to 1 N. Here ρ is the thickness above a hard 'core', and the core is defined as the thickness at 3 N. Quote: "exhibiting a soft regime for low compression that stiffens". COMPUTED from their numbers: A_comp = 5 × 1.31 = 6.55 mm², so 1 N ≈ 153 kPa and 3 N ≈ 458 kPa. The small-strain transverse modulus is k·ρ0 ≈ 8–12 kPa. At about 150 kPa the total thickness is about 0.6 of the free caliper diameter; at about 460 kPa it reaches the core (about 0.54 of free). Scaled to #5 (×√(200/394) = 0.71): free diameter ≈ 0.93 mm and core ≈ 0.50 mm. That core is exactly the diameter at packing 0.66 in your estimate, so the 0.5 mm figure is the compacted diameter, not the free one.**

- Numbers: Cotton: k = 11.49 ± 3.00 (printed as mN mm^-2; the small-strain form F ≈ A·k·Δρ implies force per volume, so the units are ambiguous), p = 2.94 ± 0.11. Bending B = 70.8 ± 21.4 mN·mm². In-knit caliper diameter 1.31 ± 0.11 mm. Fitted core radius 53.9 ± 5.3% of yarn radius. For comparison, acrylic: k = 0.62, p = 2.42.
- Source: Singal, Dimitriyev, Gonzalez, Cachine, Quinn, Matsumoto, 'Programming Mechanics in Knitted Materials, Stitch by Stitch', arXiv 2302.13467v2: Methods, Supplementary Note 3 (Suppl. Eq. 5–6), Suppl. Tables 1, 4 and 7. https://arxiv.org/html/2302.13467v2
- Confidence: high for the reported fit values; medium for scaling to #5 (the compression is flat-plate, not at a crossing, the 'free' diameter includes fuzz, and the units are ambiguous)

**2.2. SOURCE, and the only experiment found that reproduces our geometry. Kawabata's 'wire method' hangs a tensioned yarn across a 0.5 mm steel wire at 30°. The contact force is F_c = 2·F_y·sin30°, and the yarn thickness at the crossover is recorded as F_c rises. Quote: "the wire method can catch well the yarn compressional property". The measured thickness drops steeply within the first 2–3 gf and levels off by about 10–15 gf (Fig. 7). Parallel-plate compression gives about twice as much deformation as at a real crossover, so the authors used an empirical correction factor of ×1/2. A yarn taken out of a finished fabric compresses much less than raw yarn, and one blend yarn (W-WY6) barely compresses at all.**

- Numbers: Wire 0.5 mm, first cycle. Raw worsted R-WY8 (41.6 tex, close-packed diameter 0.213 mm): D0 = 0.252 mm, D10 (F_c = 10 gf = 0.098 N) = 0.181 mm, change −0.078 mm (−31%). Yarn from fabric W-WY8: 0.220 → 0.170 mm (−0.044 mm, −20%). Second cycle: 0.247 → 0.177 mm and 0.202 → 0.169 mm. COMPUTED: thickness at 10 gf ≈ 0.79–0.85 × the close-packed diameter. Force ∝ tex at equal pressure, so for #5 (200 tex) 10 gf corresponds to about 0.47 N. With close-packed diameter 0.43 mm for #5, the thickness at a crossover would be about 0.34–0.37 mm at the full 10 gf-equivalent load (~1.4 MPa) and about 0.40 mm at ~0.5 MPa.
- Source: Kawabata S., Niwa M., Matsudaira M., 'Measurement of Yarn Thickness Change Caused by Tension and Lateral Pressure by Wire Method', J. Text. Mach. Soc. Japan 31(1):7–14 (1985), Eq. (1), Table 2, Figs 5–10. https://www.jstage.jst.go.jp/article/jte1955/31/1/31_1_7/_pdf
- Confidence: high for the data (read from Table 2 in the rendered PDF). Medium-low for transfer to cotton pearl: the yarns are worsted wool and wool/polyester, not cotton.

**2.3. SOURCE: van Wyk's original compression law for a random fibre mass (wool). Pressure is linear in the inverse cube of the volume: eq. (5c) p = [4kYm³/(9π²ρ³)]·(1/v³ − 1/v0³). The coefficient contains the fibre mass but not the fibre diameter. Quote: "the inverse cube law holds only after repeated compression by the static method". At low pressures the curve does not follow the law. The modern form is σ = kE(φⁿ − φ0ⁿ): n = 3 for a 3-D random network, and about 5 at high compaction (Toll's law). COMPUTED observation: if the yarn thickness scales as 1/φ, Singal's pearl-cotton fit has exactly the van Wyk form with n = p = 2.94 ≈ 3. The cube law therefore holds for the yarn too, but only above its fuzz regime.**

- Numbers: n = 3 (van Wyk); n ≈ 5 (Toll, high compaction); van Wyk's quoted range of fitted exponents is 3–15.5 (PMC review). Van Wyk's static coefficient A = 6.4×10³ – 23.4×10³ kg·cm⁷ per 5 g of wool.
- Source: van Wyk C.M. (1946), 'A study of the compressibility of wool…', Onderstepoort J. Vet. Sci. 21(1), eqs (5c), (26), (27), pp. 142–144. https://repository.up.ac.za/handle/2263/59727. Also arXiv 2502.15736 (nylon fibre aggregates, n = 3 and n = 5) https://arxiv.org/html/2502.15736v2, and PMC10096075.
- Confidence: high for the law; low for its direct use on a twisted mercerised thread (van Wyk's assumptions are random fibres and no slippage)

**2.4. SOURCE: another group characterised a 2-ply mercerised cotton yarn (Supreme 20/2) for knit simulation. They report that cotton and nylon are transversely isotropic, quote: "the cross-section is more compliant by four orders of magnitude than the length direction". Transverse compression was tested on 10 yarns laid in parallel under a 25 mm plate at 0.01 mm/s up to 50 N, after pre-tensioning each yarn until its diameter matched its in-knit value. The cotton's rest diameter barely changed once knitted (0.445 mm vs 0.444 mm), while nylon collapsed from 0.951 to 0.334 mm.**

- Numbers: Cotton 20/2 (about 59 tex): d0 = 0.445 mm, in knit dk = 0.444 mm. Nylon: 0.951 → 0.334 mm. Transverse/longitudinal stiffness ratio ~10⁻⁴. COMPUTED: 0.445 mm is 1.6 × the compacted round diameter at φ = 0.66 (0.27 mm). By the same ratio, #5 would look about 0.8 mm wide by eye or caliper.
- Source: 'Multi-level mechanical modeling and computational design framework for weft knitted fabrics' (Knit Happens), arXiv 2501.07567, Sec. 3.1, Fig. 2, Table I, App. B. https://arxiv.org/html/2501.07567v2
- Confidence: medium: the numbers are read from the text; the moduli themselves are only plotted and fitted, not tabulated

**2.5. SOURCE, contact force from tension. (a) Capstan: a rope element over a curved surface gets normal force δR ≈ T·δφ, so the line load is T/r. (b) Laplace's law for garments: P = T/r, assuming negligible bending stiffness. (c) At a crossing the force equals the tension times the kink: F = 2T·sinθ (Kawabata eq. 1, θ = 30°). COMPUTED for the mari (R = 38 mm): a lone laid thread presses q = T/R = 0.026 N/mm per newton of tension. Over the 0.71 mm laid width that is a contact pressure of about 37 kPa per newton, so 11–75 kPa for T = 0.3–2 N. On a rigid ball, a taut thread lifted by Δ over a crossing leaves the surface at a = √(2RΔ) (about 6 mm for Δ = 0.45 mm), and its kink force is F ≈ 2T·√(2Δ/R) ≈ 0.3·T. Spread over a patch of about 0.5 mm² (perpendicular crossing, w ≈ 0.7 mm) that is about 0.6 MPa per newton of tension, roughly 15 times the pressure under a lone thread. The thread's bending length √(B/T) ≈ 0.1 mm, so treating it as a string is valid.**

- Numbers: q = T/R = 0.026 N/mm per N. Lone-thread pressure ≈ 37 kPa per N. Crossing force F ≈ 0.3 T (rigid ball, Δ ≈ 0.45 mm). Crossing pressure ≈ 0.4–0.6 MPa for T ≈ 1 N. Lift-off length ≈ 6 mm on a rigid ball, about 2–4 mm on a soft wrap. The gap at 3 mm from the crossing is < 0.15 mm, so the thread still looks as if it 'lies on' the ball.
- Source: https://en.wikipedia.org/wiki/Capstan_equation (derivation δR ≈ T δφ); 'Predicting Compression Pressure of Knitted Fabric Using a Modified Laplace's Law' https://pmc.ncbi.nlm.nih.gov/articles/PMC8401858/; Kawabata et al. 1985 eq. (1) (link above)
- Confidence: high for the formulas; the numbers are computed

**2.6. COMPUTED answer to Q1, rise of the thread axis at a two-thread crossing. Model: each thread is a taut string on the sphere, resting on a one-sided elastic (Winkler) foundation that stands in for the wrap. The upward response includes lift-off; the downward response is linear. Each thread's thickness at the crossing follows a compression law calibrated either to Kawabata's wire data or to Singal's pearl-cotton fit. Result: the axis rises 0.15–0.55 mm over the whole scanned range. The plausible range is 0.25–0.45 mm, which is 0.5–0.9 × the 0.5 mm round diameter, or 0.35–0.65 × the 0.71 mm laid width. The biggest unknown is how soft the wrap is, written as s0 = how deep a lone thread sinks into the wrap under its own tension. The dependence on T is weak once s0 is fixed, because the kink force, foundation load and decay length √(R·s0) all scale with T. Two limits: on a very soft wrap the rise tends to about half the lower thread's compressed thickness, because the upper thread lifts and the lower one sinks equally (rise ≈ t_c/2 + (t_c − t0)/2). On a stiff wrap it tends to t_c + (t_c − t0)/2.**

- Numbers: Case T = 1 N, 0.5 mm² patch, laid thickness t0 ≈ 0.54 mm, crossing thickness t_c ≈ 0.46 mm. By s0: s0 = 0 (rigid): F = 0.31 N, p = 0.62 MPa, rise = 0.42 mm, lift-off ≈ 5.9 mm. s0 = 0.01 mm: F = 0.28 N, lower thread sinks 0.09 mm, rise 0.34 mm, lift-off ≈ 4.7 mm. s0 = 0.03 mm: F = 0.26 N, sink 0.14 mm, rise 0.29 mm, lift-off ≈ 3.8 mm. s0 = 0.1 mm: F = 0.21 N, sink 0.21 mm, rise 0.23 mm, lift-off ≈ 2.1 mm. Across all laws and T = 0.3–2 N the two-thread rise is 0.14–0.54 mm. Thread thickness at the crossing is 0.36–0.60 mm, depending on the law. Contact pressure at the crossing is 0.2–1.2 MPa.
- Source: Own computation (crossing.py and run2.py in the scratchpad), using Kawabata 1985, Singal et al. arXiv 2302.13467 and the capstan/Laplace relation as inputs
- Confidence: medium-low: a range for the order of size, not a measured value. The wrap stiffness and the kagari tension are assumed, not measured.

**2.7. COMPUTED answer to Q2, several threads crossing at one spot. The rise builds up almost linearly with layer count, not with a clear saturation. Each thread above the bottom one adds its own kink force, so the load on the bottom thread grows about as Σ√i. Thread compression, however, levels off by about 0.5 MPa, so each extra layer adds roughly one compressed thread thickness minus the extra sinking into the wrap. The first layer adds a little less because the top thread flattens too. So the rise is additive with a per-layer increment of about 0.2–0.5 mm, and the wrap takes up more as the stack grows. SOURCE support: Kawabata's thickness model assumes the fabric thickness at a crossover is the sum of the warp and weft thicknesses. Genuine sub-linear 'nesting' is documented only for layers stacked parallel: for woven preforms 'for a given pressure, the thickness per layer decreases due to nesting'. Where kiku threads cross at small angles near the pole, a thread can slip into the groove between two lower threads, and there it will add less than a full layer.**

- Numbers: Rise of the top axis for n = 2 / 3 / 4 layers at T = 1 N, 0.5 mm² patch. Rigid ball: 0.37 / 0.75 / 1.16 mm (Kawabata-raw law); 0.47 / 0.94 / 1.42 mm (Kawabata-set law). s0 = 0.03 mm: 0.26 / 0.50 / 0.77 mm; 0.33 / 0.65 / 0.97 mm. s0 = 0.1 mm: 0.20 / 0.43 / 0.67 mm. The ratios rise3/rise2 ≈ 1.9–2.2 and rise4/rise2 ≈ 2.8–3.3 hold in every case.
- Source: Own computation. Additivity assumption: Kawabata et al. 1985 (Sec. 2). Nesting: Chen & Chou, 'Compaction of woven-fabric preforms: nesting and multi-layer deformation', Compos. Sci. Technol. (2000) https://www.sciencedirect.com/science/article/abs/pii/S0266353800000178 (abstract/snippet only)
- Confidence: medium-low. Sideways sliding of a thread off a tall stack and small-angle nesting are not modelled.

**2.8. SOURCE plus COMPUTED, cross-section shape (Q4). AMANN reports that 3-ply threads are close to round and 2-ply threads are flatter; pearl cotton is 2-ply. Quote on 3-ply: "their thread cross-section has an approximately round shape". Textile geometry models describe yarns in fabric as circular, elliptical, racetrack (Kemp) or lenticular. Ozgen & Gong measured how the flattening e = b/a changes along the yarn path and found twist to be the main factor. COMPUTED 2-ply geometry for #5: each ply has diameter d/√2 = 0.36 mm, and the plies side by side are √2·d = 0.71 mm wide. That equals the TemariKai laid width of 5 mm / 7 threads = 0.71 mm, so the gauge width corresponds to the two plies lying side by side, not to a round thread. Along each half ply-twist the cross-section alternates between wide-and-flat and narrow-and-tall; under tension the tall positions flatten first. COMPUTED from Kawabata's data: thickness 0.8–0.85 × the close-packed diameter at packing 0.7–0.8 means width/height ≈ 1.6–2.0 at a crossing. For a laid #5: width 0.71 mm over height 0.45–0.55 mm gives width/height ≈ 1.3–1.6, rising to about 1.6–2.0 where threads cross.**

- Numbers: #5: compacted round diameter 0.50 mm (φ 0.66); close-packed diameter 0.43 mm (φ 0.907); ply diameter 0.36 mm; 2-ply envelope 0.71 mm; apparent (caliper/eye) diameter ≈ 0.8–0.93 mm. Width/height ≈ 1.3–1.6 when laid, ≈ 1.6–2.0 at crossings.
- Source: AMANN wiki https://www.amann.com/knowledgehub/amann-wiki/sewing-thread-construction-explained-types-properties-and-applications/ ; 'An Overview of Modeling Yarn's 3D Geometric Configuration', J. Textile Sci. Technol. 2015 https://file.scirp.org/pdf/JTST_2015020613482828.pdf ; Ozgen & Gong, Text. Res. J. 81(15):1523 (2011) https://research.manchester.ac.uk/en/publications/modelling-of-yarn-flattening-in-woven-fabrics/
- Confidence: medium for the geometry and shape; low for the numeric width/height ratios (no cotton-pearl cross-sections found)

**2.9. SOURCE: El Messiry & Eltahan (2023) studied transverse compression of cotton yarns and fabrics. From the abstract: "The yarn compaction curve exhibits asymptotic hardening". Yarn count, fibre volume ratio and spinning method all changed the compression modulus. The full text is open access (CC BY-NC) but the publisher's site blocked it (HTTP 403), so no numbers were extracted.**

- Numbers: No numbers extracted; qualitative only.
- Source: El Messiry M., Eltahan E., J. Industrial Textiles 53 (2023), doi:10.1177/15280837231176859. Abstract via the Semantic Scholar API; PDF https://journals.sagepub.com/doi/pdf/10.1177/15280837231176859
- Confidence: high for the qualitative statement; no numbers

**2.10. SOURCE, thickness gauge (ASTM D204, sewing threads). The thread-diameter method with a thickness gauge uses a presser foot 9.52 ± 0.02 mm in diameter loaded to 1.67 ± 0.03 N, which is 23.4 kPa over the foot. An optical method reads the diameter to 0.02 mm. COMPUTED: under that foot, one #5 thread (about 0.6 mm contact width) actually carries about 1.67/(9.52 × 0.6) ≈ 0.29 MPa, about the same as the pressure at a kagari crossing. A dial-gauge reading on a single thread (not threads laid side by side) is therefore a direct measure of t_c, the thread thickness at a crossing. This is a cheap measurement the maker could do.**

- Numbers: Foot Ø 9.52 mm, force 1.67 N, 23.4 kPa nominal; ≈ 0.29 MPa on one 0.6 mm-wide thread (computed).
- Source: ASTM D204 via a search snippet of a Scribd copy https://www.scribd.com/document/566338633/D204 ; standard page https://store.astm.org/standards/d204
- Confidence: medium-low: the standard text was not read directly (403); values come from a snippet

**2.11. SOURCE, packing and nominal sizes. Cotton ring-spun yarns have packing density about 0.5–0.6, compact-spun 0.55–0.7 and open-end 0.40–0.46. One weaver measured pearl cotton at about 46 (#3) and 60 (#5) warps per inch, where warps per inch = 2 × wraps per inch, 'squishing' the wraps together on a ruler. COMPUTED: 30 wraps per inch = 0.85 mm per #5 wrap and 23 = 1.1 mm per #3 wrap. These are laterally packed widths and agree with the TemariKai 0.71 mm to within about 20%. DMC skein figures of 5 g / 25 m give 200 tex for #5.**

- Numbers: Packing φ: ring 0.5–0.6, compact 0.55–0.7, open-end 0.40–0.46. #5 ≈ 0.85 mm and #3 ≈ 1.1 mm per wrap.
- Source: 'Packing density of compact yarns' (search snippet) https://www.researchgate.net/publication/249785641_Packing_Density_of_Compact_Yarns ; http://aspinnerweaver.blogspot.com/2013/10/size-matters-how-many-warps-per-inch.html
- Confidence: medium-low (snippet, and a craft blog)

**2.12. SOURCE plus COMPUTED, Q3 (how a wound ball grows). Package density depends on winding tension: cotton soft-wound dye packages are 0.36–0.40 g/cm³. Winding below about 1 g of tension gives 0.1–0.2 g/cm³ (patent). Hard-wound polyester packages reach 0.80–0.92 g/cm³ (patent). Package hardness rises linearly with winding density (Bakan et al., abstract). COMPUTED, since volume is conserved: R(L) = (R0³ + 3Lτ/(4πρ_p))^(1/3), with τ in tex and ρ_p the package density. Example: 30 tex thread at 0.5 g/cm³ takes 60 mm³ per metre, so growing R from 35 to 38 mm needs about 840 m. Each layer of parallel threads at spacing s, wound at tension T, adds radial pressure Δp = T/(R·s) (Laplace). For T = 1 N, R = 38 mm and s = 0.3 mm that is about 0.09 MPa per layer, so inner layers become strongly compacted and partly lose their tension. A radius gain per layer smaller than the thread's own thickness is therefore expected, and the higher the tension, the less each layer adds. A single embroidered layer of #5 is not compacted further by later winding. Where #5 threads lie side by side without crossing, they add their laid thickness of about 0.45–0.55 mm, which works out to an effective 'package density' of about 0.56 g/cm³.**

- Numbers: ρ_p: 0.1–0.2 (soft), 0.36–0.40 (cotton dye package), 0.8–0.92 g/cm³ (hard). Δp ≈ 0.09 MPa per layer per N at s = 0.3 mm. About 840 m of 30 tex thread per 3 mm of radius at 0.5 g/cm³.
- Source: https://textilernd.com/types-of-yarn-winding-process-soft-winding-and-hard-winding-process/ ; patent snippets (US4688734 / US6824869 family); Bakan et al. https://www.researchgate.net/publication/327013245 (abstract only); Laplace's law as above
- Confidence: medium for the formulas; low for the density–tension numbers (secondary sources)

**2.13. SOURCE, tension in hand stitching (the input the crossing force scales with). In a continuous hand-placed surgical suture, the maximum thread force was 3 (SD 1.2) N, and the retained tension settled around 1.0 (SD 0.6) N. For machine embroidery, bobbin tension is quoted at 18–22 gf. Our model assumes kagari tension T = 0.3–2 N, centre about 1 N. #5 cotton breaks at roughly 40–50 N (computed from about 20–25 cN/tex × 200 tex), so hand stitching uses about 1–4% of the breaking load.**

- Numbers: Suture 3 ± 1.2 N peak, 1.0 ± 0.6 N retained; machine bobbin 18–22 gf; assumed T = 0.3–2 N
- Source: 'Force Sensing in Surgical Sutures' https://pmc.ncbi.nlm.nih.gov/articles/PMC3871579/ ; MaggieFrames tension-gauge guide (search snippet)
- Confidence: low for the kagari tension (not measured for temari)

**Formulas.**

Units: N, mm, MPa.
1. Line load of a taut thread on the ball: q = T/R (capstan δR ≈ T·δφ; Laplace P = T/r). Contact pressure of a lone laid thread ≈ T/(R·w).
2. Kink force at a crossing: F = 2T·sinθ (Kawabata 1985, eq. 1). On a rigid ball with lift Δ: θ ≈ √(2Δ/R), lift-off distance a = √(2RΔ), F ≈ 2T·√(2Δ/R).
3. Soft wrap as a one-sided Winkler foundation with modulus k_f:
   - sink of a lone thread s0 = T/(R·k_f); decay length λ = √(T/k_f) = √(R·s0);
   - linear point load: w = F/(2√(T·k_f));
   - lift-off branch (when F > 2T·√(s0/R)): F = 2T·(a/R + s0/λ) and underside rise U = s0 + a²/(2R) + s0·a/λ.
   Limits for the axis rise: soft wrap Δ ≈ t_c/2 + (t_c − t0)/2; rigid ball Δ ≈ t_c + (t_c − t0)/2. Here t_c is the compressed thickness at the crossing and t0 the laid thickness.
4. Compression laws:
   - van Wyk (1946) eq. 5c: p = [4kYm³/(9π²ρ³)]·(1/v³ − 1/v0³), equivalently σ = kE(φ³ − φ0³); generalised as σ = kE(φⁿ − φ0ⁿ) with n ≈ 5 at high compaction (Toll).
   - Singal et al. for pearl cotton 3/2: F = A·k·(ρ0/p)·[(ρ0/ρ)^p − 1], with k = 11.49 and p = 2.94, and ρ = thickness above the 3 N core.
   - Saturating fit I made to Kawabata's wire data: t = D0·[1 − c·(1 − e^(−p/p*))], with c = 0.12–0.31 and p* ≈ 0.35 MPa.
5. Stacked crossings: N_{i−1} = N_i + P_i (kink forces add up downward). Compatibility: underside of thread i+1 = underside of thread i + t_i.
6. Two-ply geometry: d_ply = d/√2; side-by-side width = √2·d.
7. Ball growth: R(L) = (R0³ + 3Lτ/(4πρ_p))^(1/3). Each wound layer adds Δp = T/(R·s).
8. Force scaling between yarns at equal pressure: F ∝ tex. Kawabata's 10 gf on 41.6 tex corresponds to about 0.47 N on 200 tex.

**Gaps.**

1. Nobody has measured cotton pearl or embroidery thread at a crossing. The only crossover (wire-method) data are for worsted wool and wool/polyester (Kawabata 1985); the only pearl-cotton data are flat-plate (Singal). Moving between them assumes the same behaviour at equal pressure.
2. Singal's k is printed in mN mm^-2, but the small-strain form F ≈ A·k·Δρ needs force per volume. The modulus (~8–12 kPa) is robust either way; the exact formula is not.
3. The softness of the wrap under a narrow load (k_f, or s0) dominates the answer and is unknown; I scanned s0 = 0–0.3 mm. A cheap measurement would settle it: s0, or a dial-gauge indentation of the wrap with a 0.7 mm strip.
4. Kagari tension is not measured (0.3–2 N assumed); luckily the result depends only weakly on T once s0 is fixed.
5. Several sources could not be read in full (HTTP 403 or paywall): El Messiry & Eltahan 2023, the ASTM D204 text (gauge numbers come from a snippet), Ozgen & Gong 2011 (flattening values), Chen & Chou 2000 (nesting), Bakan et al. (tension vs package density), Catlow & Walls (wound-package pressure; not found), and Toll 1998 (k values).
6. No measured cross-section of DMC #5 was found. The width/height ratios are computed from 2-ply geometry and Kawabata's data.
7. The model leaves out: bending of each ply along its twist (thickness varies every half twist pitch), sideways slipping off a tall stack, small-angle nesting near the kiku pole, friction and hysteresis (Kawabata pre-cycled his yarns; the second cycle is about 10% thinner), and spreading of the wrap beyond the Winkler approximation.
8. Measurement that would pin Q1 down: one #5 thread under a dial thickness gauge (≈0.3 MPa on the thread, about the crossing pressure) gives t_c, and a macro side photo or profile of one crossing on the real mari gives the rise Δ directly.

### 1.3. Yarn package winding (package density vs tension, diameter build-up, yarn compression at crossings in packages) and wound-ball physics (ball of string, baseball windings)

**3.1. The closest thing to a direct answer for Q1/Q2 is in the package-winding literature. Bandara & Durur measured the thickness of stacked yarn layers crossing at 90 deg (2, 3 and 6 layers) under a known load per crossing, so they could get the transverse modulus of yarn at crossings in a package. The source says it measures the "thickness of a yarn, when compressed transversely between two similar yarns" and fits T_n = (n-2)x + 2y (x = inner yarn, y = outer yarn). The yarn is 2-ply worsted wool R42/2 (tex 42, two plies of 21 tex), placed between rigid plates. They used 90 deg and note that a package crossing is about 60 deg.**

- Numbers: Load per crossing is in gf, thickness in mm. 2 layers (t2): 0.39 at 4.1 gf; 0.35 at 7.2; 0.33-0.34 at 8.6-10.3; 0.30-0.31 at 12.8-16.3; 0.28-0.29 at 18-29; 0.26-0.27 at 32-47; 0.24-0.25 at 54-73. 6 layers (t6): 0.96 at 7.2; 0.85 at 10.3; 0.74 at 15.0; 0.70 at 29.5; 0.60 at 41; 0.49 at 72.6. 3 layers (t3): 0.28-0.52, noisy. Fitted per-yarn values (Table 2): x falls from 0.16 to 0.07 mm and y from 0.16 to 0.12 mm as the load goes from about 7 to 66 gf.
- Source: Bandara P., Durur G., 'The measurement of yarn thickness as applicable to cross wound yarn packages', Proc. 3rd Int. Conf. Novelties in Weaving, Maribor 1999, pp. 74-82. Reprinted as Appendix E1 and Section 3.2.2 (Table 3.2) of Durur G., 'Cross winding of yarn packages', PhD thesis, Univ. of Leeds 2000: https://etheses.whiterose.ac.uk/id/eprint/4047/1/uk_bl_ethos_550542.pdf (landing page http://etheses.whiterose.ac.uk/4047/)
- Confidence: high that the data are as stated (a tabulated measurement); medium-low that they transfer to pearl cotton (different fibre, rigid plates, 90 deg only)

**3.2. COMPUTED from the Bandara & Durur table. At a single crossing, each yarn is compressed to about one ply diameter or a little less. For a 2-ply yarn this means the plies lie side by side and flatten. Stacking is close to linear at low load and sub-linear at high load: each extra layer adds 82-100% of a single yarn's crossing thickness at 7-30 gf, and 68-77% at 41-73 gf. Stacking does add up, but compaction grows with the load per crossing.**

- Numbers: Worsted ply diameter d1 = 0.193 mm (21 tex, wool 1.31 g/cm3, packing 0.55); equal-area round diameter of the whole yarn = 0.26-0.29 mm. Per-yarn thickness at a crossing, t2/2 = 0.195 -> 0.12 mm, which is 1.0 -> 0.62 x d1, or 0.72 -> 0.44 x round diameter, over 4 -> 73 gf. Increment per added layer (t6-t3)/3: 0.17 mm at 7 gf, 0.13-0.18 at 15, 0.12-0.13 at 30, 0.09 at 41, 0.07 at 60-73. Ratio t6/(3*t2): 0.82-1.02 at 7-30 gf, 0.68-0.77 at 41-73 gf.
- Source: Computed from Table 3.2 and Table 2 in Durur 2000 (link above)
- Confidence: medium (the 3-layer column is noisy: t3-t2 ranges 0.04-0.16 mm)

**3.3. COMPUTED: the contact force at a crossing on the mari. Model a perfectly flexible thread at tension T lying on a rigid sphere of radius R. Lifted by Δ at a crossing, it bridges a half-length a = sqrt(2RΔ) on each side. All the load it would have spread along 2a is concentrated on the lower thread: F = 2T*sqrt(2Δ/R). Away from crossings the thread presses with a line load q = T/R.**

- Numbers: R = 38 mm, Δ = 0.2-0.4 mm, so a = 3.9-5.5 mm (bridged span 8-11 mm) and F = 0.21-0.29 x T. T = 0.5 N gives F = 10-15 gf; T = 1 N gives 21-30 gf; T = 2 N gives 42-59 gf. Free-lying contact pressure q/w (w = 0.71 mm) is 18, 37 and 74 kPa at T = 0.5, 1 and 2 N. Pressure at a crossing, about F/(0.7 x 0.7 mm2), is roughly 0.2-1.2 MPa, more than 10x higher. These loads fall in the same range Bandara & Durur tested (4-73 gf).
- Source: Own derivation (string over a sphere with a point support). Hand kagari tension T = 0.3-2 N is assumed, not sourced.
- Confidence: medium for the formula (exact for a rigid ball and a flexible thread); low for T

**3.4. COMPUTED estimate for Q1 (pearl cotton #5 crossing pearl cotton #5 on the mari). Map the load onto the worsted data by equal contact pressure: F_equiv = F*(d1_worsted/d1_pearl)^2 = 0.29 x F. Each #5 thread at a crossing then comes out 0.78-0.95 x its ply diameter thick. The rise of the upper thread's axis is Δ = t_lower,c - (extra local indentation of the lower thread into the wrap) + (t_upper,c - h_upper,free)/2.**

- Numbers: d1 of pearl #5 (100 tex per ply, cotton 1.52 g/cm3, ply packing 0.6-0.7) = 0.35-0.37 mm. Equivalent loads 3-17 gf give t at the crossing ≈ 0.28-0.35 mm. The upper-thread term (t_up,c - h_free)/2 ≈ -0.04 to 0 mm. Extra wrap indentation is assumed 0-0.1 mm. RESULT: axis rise Δ ≈ 0.2-0.35 mm, central ≈ 0.28 mm, plausible outer band 0.15-0.40 mm. That is about 0.55 x the 0.50 mm equal-area diameter, or about 0.8 x the ply diameter.
- Source: Computed from Bandara & Durur data plus the force model above
- Confidence: low-medium (no direct measurement on mercerised cotton or on a mari; mercerised 2-ply is probably stiffer than worsted, which pushes toward the upper end)

**3.5. COMPUTED estimate for Q2 (a pile of several threads crossing at one spot). Assumptions: the interface k threads from the top carries about k*F; outer-yarn and inner-yarn thicknesses are taken from the Bandara & Durur curves; F grows as sqrt(Δ). Each added thread then adds somewhat less than the first crossing did (mildly sub-linear). The pile also presses the bottom thread harder into the wrap, with a load of (n-1)F.**

- Numbers: T ≈ 1 N, before wrap indentation: 2 threads ≈ 0.30 mm; 3 threads ≈ 0.55 mm (increment ≈ 0.25 = 0.8 x the first); 4 threads ≈ 0.8 mm (increment ≈ 0.25). At T ≈ 2 N the increments are about 0.6-0.75 x the first. Rule of thumb: rise_n ≈ Δ1*[1 + (0.7-0.85)*(n-2)].
- Source: Computed from Durur 2000 Table 3.2 and Table 2
- Confidence: low

**3.6. Package density rises with winding tension, but moderately. On worsted random-wound cheeses, tripling tension raised density by about 25% and cradle pressure mattered less. The source says "changing yarn tension has a greater effect on package density than pressure". Cumulative density stays nearly constant as the package grows (outer radius 41 -> 81 mm), so the build-up is close to linear: later layers do not compact earlier ones much. Note: the HAUI 2024 paper cites these numbers as cotton, but the thesis states the yarn was R42/2 worsted.**

- Numbers: R42/2 worsted, tension 8 / 19 / 30 gf: 0.381 / 0.435 / 0.478 g/cm3 at 2 kg cradle load; 0.360 / 0.414 / 0.457 at 1.25 kg; 0.351 / 0.400 / 0.444 at 0.7 kg. At 30 gf and 2 kg, density at outer radius 41 / 51 / 61 / 71 / 81 mm = 0.481 / 0.486 / 0.480 / 0.471 / 0.471 g/cm3.
- Source: Durur 2000, Section 3.4, Table 3.4 and Appendix B.1: https://etheses.whiterose.ac.uk/id/eprint/4047/1/uk_bl_ethos_550542.pdf
- Confidence: high

**3.7. Cotton cheeses: higher winding tension gives higher package density, and a larger coil angle gives lower density. The source says "by increasing tension the yarn density of cheese increases".**

- Numbers: 100% cotton open-end Ne 20/1 (29.5 tex), coil angle 35 deg: tension 23 / 28 / 30 cN gives 0.383 / 0.400 / 0.445 g/cm3 (+16% for +30% tension). At 28 cN, coil angle 30 / 35 / 39 deg gives 0.401 / 0.366 / 0.335 g/cm3.
- Source: El-Moursy A.M., Diab H.A., Mohamed A.I., 'An approach to the impact of yarn tension and coil angle on the dye absorption of cheeses in winding', IJARSE (Table 5): https://www.ijarse.com/images/fullpdf/1463565534_38_Research_Paper.pdf
- Confidence: high for the reported numbers (one cheese per setting)

**3.8. Ring-spun cotton and CVC cones: tripling the tensioner load raises density by only 6-10%, and winding speed matters more. The paper also gives industry target ranges. It quotes Talavasek for 30-tex cotton: "if yarn tension increases by 0.01N, winding density will increase by 0.005g/cm3".**

- Numbers: Tensioner load 10 -> 30 cN: combed cotton Ne 30/1 0.481 -> 0.512 g/cm3 (+6.4%); CVC Ne 31/1 0.525 -> 0.575 (+9.5%); CVCM Ne 30/1 0.539 -> 0.582 (+8%). Overall range 0.46-0.61 g/cm3. Targets: cotton dye packages 0.28-0.4 g/cm3; warping and knitting 0.4-0.6 g/cm3. Talavasek (secondhand): +0.005 g/cm3 per 1 cN, i.e. about 1.2% per cN.
- Source: Tran Duc Trung, Dao Anh Tuan, Chu Dieu Huong, 'Effect of technological winding parameters on yarn package density', HaUI J. Sci. Tech. 2024, doi 10.57001/huih5804.2024.171: https://jst-haui.vn/media/31/uffile-upload-no-title31523.pdf
- Confidence: medium (the Talavasek figure is secondhand)

**3.9. Diameter vs wound length follows a square-root law, which is what constant density gives for a cylinder. The source says "diameter increase can be modeled as a square root function of the yarn length". Of the process parameters tested, winding tension had the largest effect on diameter growth.**

- Numbers: Fit: d(s) = -a + sqrt(b*s + a^2). Cotton ring yarn Nm 34 (29.4 tex), step-precision winding, 62 mm tube, tension 15 vs 23 cN. The square-root fit had MSE 0.55, against 3.50 for a power law and 130 for a straight line. COMPUTED from their Table 3: mean b falls from 28.7 to 25.0 as tension goes 15 -> 23 cN, i.e. about 15% denser.
- Source: Gramsch S., Bell E.G., Moghiseh A., Schmeisser A., J. Engineered Fibers & Fabrics 2022, doi 10.1177/15589250211073249: https://journals.sagepub.com/doi/full/10.1177/15589250211073249
- Confidence: high for the functional form; medium for the density inference

**3.10. Typical package densities for cotton and for sewing thread. A precision-wound (near-parallel) sewing-thread package reaches about the thread's own packing, so there is almost no void between threads. A cross-wound cotton package holds only about half its volume as yarn.**

- Numbers: Cotton soft (dye) winding 0.36-0.40 g/cm3; measured by count 0.345-0.387. Sewing thread on dye packages 0.4-0.5 g/cm3; precision-wound user packages 0.7-0.8 g/cm3 (source: "say between 0.7 and 0.8 grams per cubic centimetre"). COMPUTED fibre volume fractions: cotton cross-wound 0.35-0.48/1.52 = 0.23-0.32; polyester precision 0.7-0.8/1.38 = 0.51-0.58. Ring cotton yarn itself has packing 0.5-0.6, so a cross-wound package is about 50-60% yarn by volume.
- Source: https://www.textilecalculations.com/calculation-of-package-density-in-yarn-dyeing/ ; US6921421B2 'Producing dyed thread': https://patents.google.com/patent/US6921421B2/en
- Confidence: high for the ranges

**3.11. The outermost layers of a wound body are the least compacted, because nothing presses on them from above. Durur cites Wegener & Schubert for precision cheeses: density drops sharply near the core, rises gradually with radius, and "falls again sharply near the final outer radius". For the mari, this means the top of the wrap and the embroidery layer on it are the softest part.**

- Numbers: Fig. 3.1 plots precision-cheese density of about 0.6-0.9 g/cm3 over radius 60-160 mm (curve shape only).
- Source: Durur 2000, p. 77, Fig. 3.1, citing Wegener & Schubert 1968: https://etheses.whiterose.ac.uk/id/eprint/4047/1/uk_bl_ethos_550542.pdf
- Confidence: medium (secondary citation)

**3.12. A wound yarn surface indents noticeably under a line load; this is relevant to how far the lower thread sinks into the mari wrap. The drum-to-package contact measurements show that softer (lower-density) packages deform more.**

- Numbers: Line load 0.7 / 1.25 / 2 kgf over about 126 mm (0.054 / 0.097 / 0.156 N/mm) on 0.33-0.46 g/cm3 worsted packages gave 0.18-2.2 mm radial deformation. Example at 80 mm diameter: 0.18-0.40 mm at 0.7 kg, 0.32-1.35 mm at 2 kg. For comparison (computed): the pearl-cotton crossing load of 0.1-0.5 N spread over 2-4 mm of the lower thread is a similar line load of 0.03-0.25 N/mm.
- Source: Durur 2000, Section 3.6, Table 3.8 (link above)
- Confidence: medium for the data; low for the transfer, because of the different contact geometry and wrap density

**3.13. COMPUTED: growth of a wound ball, and the thickness one layer of thread adds. By volume conservation at package density ρp, R^3 = R0^3 + 3*L*Tt/(4π ρp). Tension enters only through ρp, which by the sources above moves by only about 10-25% when tension doubles or triples. Layer thickness is set mainly by geometry: flattening plus the voids at crossings.**

- Numbers: Mari wrap (R = 38 mm): with sewing thread of about 30 tex at ρp 0.4-0.8 g/cm3, dR = 0.21-0.41 mm per 100 m of thread. Pearl #5 (200 tex) wound randomly at ρp 0.45-0.75: effective area per thread 0.27-0.44 mm2, so one full coverage at pitch 0.71 mm adds 0.38-0.63 mm. A single band of parallel, non-crossing threads adds only about its laid height, 0.34-0.39 mm. The difference, about 0.05-0.25 mm per layer, is the cost of crossings.
- Source: Own computation; ρp ranges from the sources above
- Confidence: medium (the formula is exact; ρp of a hand-wound mari is not measured)

**3.14. A real ball wound under high tension: the baseball. The source gives the circumference after each winding. COMPUTED from those: the volume each winding adds per metre, and the average density of the windings.**

- Numbers: Pill circumference 10.47 cm, 24.8 g. After 110.6 m of 4-ply wool: 19.68 cm. After +41.13 m of 3-ply: 20.77 cm. After +48.44 m of 3-ply: 22.22 cm. After +137.1 m of poly/cotton finishing yarn: 22.52 cm. COMPUTED volume per metre: 0.99 / 0.55 / 0.70 / 0.056 mm2. Total wound volume 173.5 cm3. Assuming the windings weigh 100-110 g (ball 142-149 g minus pill minus a cover of about 15-20 g, cover weight not sourced), ρp ≈ 0.58-0.63 g/cm3. That is about 0.45 fibre volume fraction for wool, for machine winding at 'very high tension'.
- Source: https://www.madehow.com/Volume-1/Baseball.html (winding data)
- Confidence: low-medium (the windings mass is assumed)

**3.15. For Q4 (cross-section), the package literature mostly assumes round yarn. Schmeisser et al. model each yarn as "a 3D yarn with a circular cross-section". The data point instead to flattened 2-ply yarns. COMPUTED for pearl #5: the envelope of two plies lying side by side (2 x d1) matches the TemariKai laid width. A laid 2-ply is therefore about 2 plies wide and 1 ply high, giving w/h ≈ 2, and more under crossing pressure. Twist makes the local height swing between about d1 (plies side by side) and up to about 2*d1 (plies stacked) every half twist pitch of the plies, so the rise will differ from one crossing to the next.**

- Numbers: Pearl #5: ply diameter d1 = 0.35-0.37 mm, 2*d1 = 0.69-0.75 mm, compared with the gauge's 0.71 mm. Laid height ≈ 0.35-0.37 mm, so w/h ≈ 1.9-2.0. The single-cylinder equal-area model gives h = 0.34-0.39 mm (ellipse) or 0.27-0.31 mm (rectangle) at w = 0.71, so w/h = 1.8-2.6. Under crossing load h ≈ 0.28-0.35 mm, so w/h ≈ 2.0-2.5. Bandara & Durur's 2-ply worsted likewise compresses to 0.63-1.0 x d1 at crossings.
- Source: Schmeisser A. et al., Text. Res. J. 2023, doi 10.1177/00405175221145908: https://journals.sagepub.com/doi/full/10.1177/00405175221145908 ; the geometry is computed
- Confidence: low-medium

**3.16. A fabric data point from outside this source family, for comparison. Single cotton yarns in a plain weave are flattened to w/h ≈ 1.3-1.6; the source calls these 'коэффициенты смятия' (crushing coefficients).**

- Numbers: Cotton warp 25 tex / weft 50 tex. Horizontal coefficients 1.082 (warp) and 1.254 (weft); vertical 0.924 and 0.797. In-fabric diameters: warp 0.222 x 0.150 mm (w/h 1.48), weft 0.321 x 0.240 mm (w/h 1.34).
- Source: Tolubeeva G.I., Tekhnologiya Tekstil'noi Promyshlennosti 2012 No. 2(338): https://ttp.ivgpu.com/wp-content/uploads/2015/10/338_14.pdf
- Confidence: medium

**3.17. No 'law of the ball of string' exists beyond volume conservation (R proportional to L^(1/3) at fixed packing). The packing fraction is the empirical part. One physics Q&A that asks for a ball's yarn length from its size has no accepted answer. A popular Fermi estimate back-calculates a packing fraction of 0.75 for a sisal twine ball, against 0.91 for hexagonally packed parallel rods.**

- Numbers: Twine ball: about 3 m diameter, twine 4.5 mm, estimated packing about 0.75 (a commenter's back-calculation, not a measurement).
- Source: https://www.physicsoverflow.org/42579/how-long-is-the-yarn-in-a-large-ball-of-yarn ; https://scienceblogs.com/builtonfacts/2010/03/25/the-biggest-ball-of-twine-in-m
- Confidence: low

**3.18. Qualitative support: compression concentrates at crossings. Two crossed cotton yarns absorbed less than twice the compression energy of a single straight yarn, which the authors attribute to deformation at the cross-point. Yarns dried while crossed showed a sharper dent at the crossing.**

- Numbers: No usable numbers in the text (values are in figures). Cotton 2-ply 14.5 tex x 2; KES-FB3 compression tester, 200 gf maximum on 2 cm2.
- Source: Kim K.O. et al., Text. Res. J. 2021, doi 10.1177/0040517520986513: https://journals.sagepub.com/doi/full/10.1177/0040517520986513
- Confidence: medium (qualitative)

**Formulas.**

(1) Wound-ball growth, from volume conservation: V = L*Tt/ρp. So R(L) = (R0^3 + 3*L*Tt/(4π ρp))^(1/3) and dR/dL = Tt/(4π R^2 ρp). Units: effective area per unit length A_eff [mm2] = Tt[tex]*1e-3/ρp[g/cm3]. Cylinder analogue: D(L) = sqrt(D0^2 + 4*L*Tt/(π H ρp)), which is the square-root law Gramsch 2022 found empirically, d(s) = -a + sqrt(b s + a^2).
(2) Thickness added by one full coverage at thread pitch p: t_layer = A_eff/p = Tt*1e-3/(ρp*p).
(3) Force at a crossing on a sphere (rigid ball, flexible thread, tension T, rise Δ, ball radius R): bridged half-length a = sqrt(2RΔ); F = 2T*sqrt(2Δ/R). Free-lying line load q = T/R; contact pressure is about q/w.
(4) Bandara & Durur stack model: T_n = (n-2)*x + 2*y, where x and y are the inner and outer yarn thicknesses at a given load per crossing.
(5) Transfer between yarns by equal contact pressure: F_equiv = F*(d_ref/d)^2. For 2-ply yarns use the ply diameter d1 = sqrt(4*(Tt/2)*1e-3/(π ρf φ_ply)) mm.
(6) Axis rise at a crossing: Δ = t_lower,c - (δ_c - δ_0) + (t_upper,c - h_upper,free)/2. δ_c - δ_0 is the extra indentation of the lower thread into the wrap under F, compared with the distributed load q.
(7) Pile of n threads at one spot: rise_n ≈ Δ1*[1 + k*(n-2)], with k ≈ 0.8-1.0 at low load per crossing and 0.6-0.75 at high load (from Durur's t6/t3/t2 data).
(8) Laid 2-ply thread: w ≈ 2*d1 and h ≈ d1, so w/h ≈ 2. Local height varies between about d1 and 2*d1 along the ply twist.

**Gaps.**

1. No source measures pearl cotton (mercerised 2-ply, about 200 tex) crossing itself, or measures a thread crossing on a thread-wrapped ball. The only crossing-thickness data found are for 2-ply worsted wool R42/2, crossing at 90 deg between rigid plates. The mm result for Q1 (0.2-0.35 mm, outer band 0.15-0.4 mm) therefore rests on pressure-similarity scaling and on an assumed hand-kagari tension of 0.3-2 N; neither is sourced.
2. How far the lower thread sinks into the soft wrap is not measured for a mari. Durur's drum-contact data show wound surfaces can indent 0.2-2 mm under comparable line loads, but on softer wool packages with a different contact shape. The 0-0.1 mm used here is a guess, and it is the largest uncertainty.
3. The 3-layer column in Bandara & Durur is noisy, and they only tested 90 deg. Nothing was found on small crossing angles, where threads may slide aside and nest rather than stack.
4. Papers not obtained (paywall or 403): Fettahov et al. 2008 (CIRAT-3, tension vs winding density vs package hardness, ResearchGate); 'Studies on density of yarn packages produced in winding' (ResearchGate); Chemani & Halfaoui 2014, a theoretical density model vs winding angle; Koranne, 'Fundamentals of Yarn Winding' (book); Jhalani 1970 and Beddoe 1967 on package stresses and the transverse modulus. The Talavasek figure (+0.005 g/cm3 per cN) was seen only secondhand.
5. The HaUI 2024 paper presents Durur's 8-30 g / 0.381-0.478 g/cm3 data as cotton; the thesis states R42/2 worsted. The correct attribution is used here.
6. For the baseball, the mass of the windings is assumed (cover weight not sourced), so ρp ≈ 0.6 g/cm3 is only an estimate.
7. The density of a hand-wound mari wrap (sewing thread over batting) is unknown. It could be measured directly: weigh the thread before and after winding and take circumferences, then ρp = mass/volume.
8. A cheap check the maker could run, in the style of Bandara & Durur: lay grids of #5 at 90 deg in 2, 3 and 4 layers on a hard surface, put a known small weight on a flat plate, and read the thickness with a caliper or micrometer. Then repeat on a spare mari by measuring its circumference before and after a known length of #5 is wound on. This would replace the scaling assumption with a measured value.
9. A Chrome instance was started on its own port (9231) with its own profile to read the SAGE papers, and closed afterwards. Working files are in the session scratchpad (durur.txt, gramsch.txt, pkgcalc.py).

### 1.4. Embroidery and temari specifics: pearl cotton #5 dimensions, laid gauge, mari wrap firmness, kagari tension, how layers build up; plus wound-ball growth data (baseball) as the only numeric wound-ball record found

**4.1. SOURCE SAYS: DMC Perle 5 skein is 25 m and weighs 5 g. COMPUTED: 200 tex. The DMC 10 g ball is listed as 53 yd (48.5 m), about 206 tex; I did not open that listing myself. Anchor Pearl Cotton 5 is 23 yd per 5 g, about 238 tex.**

- Numbers: DMC skein 25 m / 5 g = 200 tex; ball ~206 tex (unverified); Anchor ~238 tex
- Source: https://www.ravelry.com/yarns/library/dmc-coton-perle-5-skein ; https://www.embroideries.com.au/dmc-perle-cotton-size-5-25m-skein-colour-115 ; https://www.ravelry.com/yarns/library/anchor-pearl-cotton-5
- Confidence: high for the DMC skein, medium for the ball and Anchor

**4.2. SOURCE SAYS: the Japanese temari thread Fujix 都手まり糸 is marked '※5番相当' (#5-equivalent). It is polyester, built as '78dtex 10×2', with total fineness 1,730 dtex, breaking strength 83 N (8,470 gf), elongation 25%, 30 m per spool. COMPUTED: round-equivalent diameter about 0.47–0.52 mm, close to DMC perle 5. Moderate hand tension of about 1–3 N is only 1–4% of its breaking load.**

- Numbers: 173 tex; 83 N break; 25% elongation; d ≈ 0.50 mm (computed, polyester 1.38 g/cm3, packing 0.6–0.66)
- Source: https://www.fjx.co.jp/product/detail.php?id=106
- Confidence: high for the spec; the diameter is computed

**4.3. SOURCE SAYS: TemariKai's thread gauges are 'DMC Perle 5: 7 threads = 0.5cm', Perle 8 '2 strands = 1 mm', floss '3 strands = 1mm'. The page does not say how the gauge was measured (on a mari? on a ruler? at what tension). It only notes 'an individual's stitching tension will vary things a bit'. COMPUTED: 0.714 mm per laid row of perle 5.**

- Numbers: perle 5 laid pitch 0.714 mm; perle 8 0.5 mm
- Source: http://www.temarikai.com/ResourcesPages/threadgauges.html
- Confidence: high that it says this; medium that it is a true laid width, because the method is unstated

**4.4. COMPUTED (standard textile formula): Peirce's cotton-yarn diameter d = 1/(28·√Ne) inch, which assumes specific volume 1.1 cm3/g (~60% fibre), gives 0.53 mm for 200 tex. Mercerised fibre 1.52 g/cm3 at packing 0.66 gives 0.50 mm. So the TemariKai laid pitch is 1.35–1.43× the round diameter.**

- Numbers: round d 0.50–0.53 mm (200 tex); 0.55–0.58 mm if 238 tex; laid/round 1.35–1.43
- Source: Peirce formula as given at https://www.onlinetextileacademy.com/yarn-diameter-formula-pierces-formula-for-cotton-spun-yarn-diameter/ and https://textilelearner.net/yarn-count-diameter-and-composition/
- Confidence: medium (the formula is standard; perle is tightly twisted and mercerised, so it may be slightly more compact)

**4.5. COMPUTED, 2-ply geometry: perle #5 is 2-ply. Each ply has d_p = d/√2 ≈ 0.354–0.375 mm, and a twisted 2-ply has a round envelope of width 2·d_p = 0.71–0.75 mm. That equals the TemariKai 0.714 mm gauge, so the gauge can be explained by the ply structure alone, with no need for heavy flattening. Laid height varies along the twist: about 0.35–0.375 mm where the plies lie side by side, up to 0.71–0.75 mm where they are stacked, averaging about 0.58–0.61 mm around the twist. An area-conserving flattened ellipse of width 0.714 mm would be h = d²/w = 0.35–0.39 mm tall, a width/height ratio of about 1.8–2.0.**

- Numbers: ply 0.354–0.375 mm; envelope 0.71–0.75 mm; ellipse height 0.35–0.39 mm; w/h 1.8–2.0
- Source: own computation from the 200 tex data and the TemariKai gauge
- Confidence: medium

**4.6. SOURCE SAYS: pearl cotton is compressible and springy on the mari, unlike rayon. The quoted wording: natural threads 'compress as they are pulled through the stitching surface but then rebound'. Of rayon it says 'what you see is what you get'. With pearl there is 'a wee bit of wiggle room'.**

- Numbers: qualitative only
- Source: https://www.temarikai.com/HowToPages/stitchingthreads.html
- Confidence: high (a craft statement)

**4.7. SOURCE SAYS, on kagari tension: the thread 'falls into place with moderate tension'. It must not be so tight that it will 'dent/alter the shape of the mari', and there must be no 'space seen between the thread and the mari due to too loose tension'. This supports the maker's account: the thread lies on the ball with no visible indentation of the wrap in normal spans.**

- Numbers: qualitative; implies indentation outside crossings is well below visible (< ~0.1 mm, my reading)
- Source: https://www.temarikai.com/HowToPages/ToolKit/kagari.html
- Confidence: high for the statement; the <0.1 mm reading is my interpretation

**4.8. SOURCE SAYS, on wrap firmness: the stitching surface should have 'a little "cushioned give" to it (just a little)'. Winding tension should be firm but not 'burning' your fingers, and needing a needle puller means the wrap is too tight. Wrapping 'adds between 1/4 to 3/4 inch (1 to 1.5cm)' to the core size; the inch and cm figures don't agree, and it doesn't say whether this is diameter or circumference. It also gives 'about 300 yards of thread for a 24 cm ball'.**

- Numbers: wrap adds 1–1.5 cm (or 0.6–1.9 cm); ~300 yd = 274 m of sewing thread for a 24 cm ball
- Source: http://www.temarikai.com/HowToPages/wrappingmari.html ; https://www.temarikai.com/HowToPages/marimaking.html
- Confidence: high that it says this; the numbers are rough guesses (the source calls them a 'guestimate')

**4.9. COMPUTED: 274 m of Tex 27–40 sewing thread (7–11 g), wound at a package density of 0.5–0.7 g/cm3 over a 24 cm ball (R 38.2 mm, area 18,335 mm²), makes a shell only 0.6–1.2 mm thick. So the sewing-thread skin under the kagari is under ~1 mm; most of the 1–1.5 cm build-up is yarn and batting.**

- Numbers: shell 0.58–1.2 mm
- Source: own computation from the TemariKai 300 yd / 24 cm figure (thread Tex and package density are assumed)
- Confidence: medium-low

**4.10. SOURCE SAYS (the only numeric record found of a ball wound under tension): baseball winding starts from a pill of 10.47 cm circumference. After 110.6 m of 4-ply gray wool it measures 19.68 cm; after 41.13 m of 3-ply white, 20.77 cm; after 48.44 m of 3-ply gray, 22.22 cm; after 137.1 m of fine poly/cotton finishing yarn, 22.52 cm. The winding machines hold a 'constant level of very high tension'. COMPUTED: effective area per metre of yarn A_eff = ΔV/L is 0.99, 0.55, 0.70 and 0.056 mm². The last 137 m of fine yarn adds only 0.48 mm of radius. Growth law: R1³ − R0³ = (3/4π)·L·A_eff, where A_eff = tex / package density.**

- Numbers: ΔR per layer 14.66, 1.73, 2.31, 0.48 mm; A_eff 0.99 / 0.55 / 0.70 / 0.056 mm²
- Source: https://www.madehow.com/Volume-1/Baseball.html (final spec 9–9.25 in: https://en.wikipedia.org/wiki/Baseball_(ball))
- Confidence: medium (a secondary source; yarn tex not given, so package density cannot be separated out)

**4.11. COMPUTED: one gap-free layer of perle #5 at 0.714 mm pitch over a 24 cm mari needs 18,335/0.714 mm ≈ 25.7 m, about one DMC skein. Averaged over the surface, that layer adds A/pitch: 0.18 mm if the fibre were solid, 0.31 mm at Peirce yarn density. This agrees with the 0.35–0.39 mm laid-height estimate, with some void between rows.**

- Numbers: 25.7 m per full layer; mean added thickness 0.18–0.31 mm per layer
- Source: own computation
- Confidence: medium

**4.12. SOURCE SAYS: on uwagake kiku points, each round is placed lower to leave room for the thread to turn. 'This usually amounts to about 2 mm (or the size of the diameter of the thread) for pearl cotton #5.' This is a spacing for the turn, not a thread-diameter measurement; 2 mm is about 3–4× the real diameter.**

- Numbers: 2 mm spacing at the points for #5
- Source: https://www.temarikai.com/HowToPages/uwagakekiku.html
- Confidence: high for the quote; do not use it as a diameter

**4.13. SOURCE SAYS (tension analogues; nothing was found for hand embroidery or temari specifically). In hand-placed surgical sutures, force in a stitch 'drops from 3 (SD 1.2) to 1 (SD 0.3) newton' once later stitches are placed. For machine embroidery, the recommended top-thread tension is 100–120 g for rayon; 'Polyester should be set between 120 and 150 grams' (≈1.0–1.5 N; bobbin 18–22 g). My working range for moderate hand kagari on perle #5: T ≈ 1–3 N.**

- Numbers: suture 1–3 N; machine embroidery top thread 1.0–1.5 N; working assumption 1–3 N
- Source: https://pmc.ncbi.nlm.nih.gov/articles/PMC3871579/ ; https://www.madeirausa.com/_resources/common/userfiles/file/Thread%20Tension%20Guide%20w-Towa%20Digital%20Tension%20Gauge%20(002).pdf
- Confidence: low-medium (analogues only)

**4.14. COMPUTED, load at a crossing: a taut thread on a sphere of R = 38.2 mm that passes over a bump of height h leaves the surface over a half-span x = √(2Rh) ≈ 4.8–6.2 mm (h = 0.3–0.5 mm). The bump then carries F = 2T·sin(x/R) ≈ 0.25–0.33·T, i.e. 0.25–1.0 N for T = 1–3 N. Away from crossings the thread presses on the wrap with T/R = 0.026–0.079 N/mm, about 0.04–0.11 MPa over 0.71 mm width. At a crossing the contact is ~0.3–0.5 mm², so about 0.5–3 MPa, 10–30× higher. Both threads therefore flatten there, and the lower thread sinks further into the wrap at the crossing than anywhere else.**

- Numbers: F 0.25–1.0 N; ambient 0.04–0.11 MPa; crossing ~0.5–3 MPa; lift half-span 4.8–6.2 mm on a rigid ball (shorter on a soft wrap)
- Source: own computation (the tension range is an assumption)
- Confidence: medium for the order of magnitude

**4.15. COMPUTED: axis rise of perle #5 where it crosses one perle #5 on the soft wrap. Rise = laid height of the lower thread (0.35–0.45 mm), minus the extra indentation of the lower thread into the wrap under the crossing load (~0.03–0.15 mm; wrap modulus unknown), minus mutual flattening at the contact (~0.03–0.10 mm), plus however far the upper thread sits sunk into the wrap away from the crossing (~0–0.1 mm). Estimate: 0.25–0.45 mm, central ≈ 0.33 mm, about 0.35–0.6 of the 0.714 mm laid width. Hard upper bound with rigid 2-ply crowns: 0.71–0.75 mm. The project's current 0.30 mm (0.42 × 0.71) lies inside the range.**

- Numbers: rise 0.25–0.45 mm (central ~0.33 mm); upper bound 0.71–0.75 mm
- Source: own computation from the findings above; no source measures it
- Confidence: low-medium

**4.16. SOURCE SAYS (stacking analogue): in embroidered carbon-roving electrodes (48k rovings stitched down, crossed layers h-v-h), 1, 3 and 5 layers had 'a thickness of circa 1, 3 and 5 mm, respectively'. Crossed stitched layers stacked linearly, with no visible nesting loss. COMPUTED for kiku: threads crossing at an angle touch at points on each other's crowns and cannot nest, so each extra layer adds ≈ 0.85–1.0× the first rise. The small shortfall comes from the contact load growing with lift height (F ∝ √h) and more compliant material underneath. Parallel neighbouring rows can nest in the grooves: hexagonal packing gives √3/2 ≈ 0.87·d per layer. Predicted for 2/3/4 crossing layers: ~0.6–0.8 / 0.85–1.2 / 1.1–1.6 mm total axis rise over the bare wrap.**

- Numbers: electrodes: 1/3/5 layers → ~1/3/5 mm; per extra crossing layer ≈ 0.85–1.0× the first rise; parallel nesting 0.87·d
- Source: https://iopscience.iop.org/article/10.1149/1945-7111/acd1d8 (layer data); the rest is own computation
- Confidence: low-medium (the electrode is a much larger material; the stacking factors are computed)

**4.17. SOURCE SAYS: in kousa (layered) kagari, the layers make a pattern that 'appears to have been woven'. The source says nothing about raised height where shapes overlap. No temari source was found (English, Japanese or Russian) that gives a measured height at kiku centres or crossings, or a measured change in circumference after stitching.**

- Numbers: none
- Source: https://temarikai.com/HowToPages/kousastylehelp.html ; Japanese sources checked with no numbers: https://note.com/temari_cat/n/nc8c19f7be788 , https://fjx.co.jp/sewingcom/recipe/detail.php?id=264 , https://www.olympus-thread.com/lineup/embroidery/549/
- Confidence: high that no such measurement was found in these sources

**4.18. SOURCE SAYS, on retail and knitting thickness figures, which run large: Gamma 'Ирис' (100% mercerised cotton, 82 m / 10 g = 122 tex) is stated as 'Толщина нити: тонкая - 0.8 мм'. Peirce gives 0.41 mm for 122 tex. Weaving 5/2 pearl cotton (2,100 yd/lb = 236 tex, 2-ply mercerised) is listed at '25 wpi', i.e. 1.02 mm per wrap, versus 0.57 mm by Peirce. Retail 'mm' and WPI figures are loose-envelope values about 1.8–2× the compact diameter; the TemariKai stitched gauge is tighter, at 1.35×.**

- Numbers: Iris 0.8 mm stated vs 0.41 mm computed; 5/2 perle 25 WPI = 1.02 mm vs 0.57 mm computed
- Source: https://spb-shop.firma-gamma.ru/good/948588632/ ; https://halcyonyarn.com/yarn/0831470L
- Confidence: medium

**4.19. SOURCE SAYS (Japanese practice): 5番 is two plies twisted together, used without splitting. By count definition, five strands of 25番 weigh the same as one 5番. In satin stitch, one strand of 5番 looks about as thick as six strands of 25番. The base is 'しっかり固く' (wound firm), finished with spun polyester 60番/90番, and the outer layer is kept soft so the needle passes well.**

- Numbers: 5番 ≈ 5 × 25番 by weight; wrap thread 60番/90番
- Source: https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q12134358992 (Q&A, low authority) ; https://note.com/temari_cat/n/nc8c19f7be788 ; https://www.olympus-thread.com/lineup/embroidery/549/
- Confidence: low-medium

**Formulas.**

tex = grams per km (25 m / 5 g → 200 tex). Ne = 590.5/tex. Peirce: d[in] = 1/(28·√Ne), giving d = 0.528 mm at 200 tex. Compact: d = √(4·tex·1e-6 / (ρ_f·1e-3·φ·π)) mm, with ρ_f = 1.52 g/cm3 and φ = 0.66, giving 0.50 mm. 2-ply: d_p = d/√2 and envelope = 2·d_p = √2·d ≈ 0.71–0.75 mm. Laid height ranges from d_p (plies side by side) to 2·d_p (plies stacked); mean around the twist is d_p·(1 + 2/π). Area-conserving flattened ellipse: h = d²/w; with w = 5/7 = 0.714 mm, h = 0.35–0.39 mm and w/h = 1.8–2.0. Mean thickness of one full layer = A_yarn/pitch = 0.18–0.31 mm. Length for one full layer = 4πR²/pitch = 25.7 m at R = 38.2 mm. Wound-ball growth: R1³ − R0³ = (3/(4π))·L·A_eff, with A_eff = tex/ρ_package; thin-shell form ΔR ≈ L·A_eff/(4πR²). Taut thread over a bump h on sphere R: lift half-span x = √(2Rh); load on the bump F = 2T·sin(√(2h/R)) ≈ 2T·√(2h/R). Ambient pressure p0 = T/(R·w); crossing pressure ≈ F/(w²). Crossing rise ≈ h_lower − δ_indent(F) − δ_mutual(F) + δ_baseline_sink. Stacking of crossed layers: n-layer rise ≈ Σ k_i·rise_1 with k_i ≈ 0.85–1.0; parallel nesting 0.87·d.

**Gaps.**

No source found for these, which is the core of the answer: (1) a measured diameter or cross-section (width × height) of DMC perle #5, round or laid; the TemariKai gauge does not say how it was measured; (2) any measured height of a crossing, or of a stack at a kiku centre, on a temari or on fabric; the academia.edu paper on hand vs machine satin/couching thickness (https://www.academia.edu/30987620) was paywalled, and the patent claiming embroidery ≤2.5 mm machine / 4–4.5 mm hand (US 5947044) could not be read as text, so both are unverified; (3) measured hand-kagari tension, where only suture and machine-embroidery values served as analogues; (4) the compressive stiffness of a mari wrap, so the indentation term (0.03–0.15 mm) is a guess; (5) a Japanese book preview with numbers, since Japanese online sources give only qualitative guidance. I did not check the DMC 10 g ball length (53 yd) myself, and Perle 8 tex was not checked. Q3 (package density vs winding tension, diameter vs wound length) is covered here only by the baseball record and the TemariKai guesses. How much yarn packs down as winding tension rises belongs to the textile-winding family. Two simple measurements would settle Q1: callipers on perle #5, and a photo taken at a crossing on the mari next to a ruler.

## 2. Synthesis (superseded where section 3 corrects it)

### riseMm

BEST ESTIMATE: 0.30 mm. Likely range 0.22 to 0.40 mm; outer band 0.15 to 0.45 mm. The hard ceiling is about 0.71 mm (rigid wrap and two uncompressed plies stacked vertically), which is not physical under kagari load. This is the rise of the upper thread's axis above the height where it lies away from the crossing, for pearl #5 over pearl #5 on a 24 cm mari at about 1 N of hand tension. In other units it is 0.42 x the 0.71 mm laid width, 0.6 x the 0.50 mm compact diameter, or about 0.7 x the laid height.

NO SOURCE MEASURES THIS. Everything below is COMPUTED from measured analogues (worsted wool and filament yarns, other cottons).

INPUTS (SAYS, then COMPUTED):
- DMC Perle 5 skein: 25 m per 5 g (ravelry / embroideries.com.au), which is 200 tex.
- Solid fibre area: 200e-6 g/mm / 1.52e-3 g/mm3 = 0.1316 mm2.
- Compact round diameter at packing 0.66: sqrt(4 x 0.1316/0.66/pi) = 0.504 mm. Peirce's cotton formula gives 0.528 mm.
- Each of the 2 plies: 0.356 mm. Two plies side by side: 0.71 mm, which equals the TemariKai gauge of 7 threads per 5 mm = 0.714 mm (http://www.temarikai.com/ResourcesPages/threadgauges.html). The gauge width is the two-ply envelope; it does not mean the thread is heavily flattened.

STEP 1: laid height h (thread on the ball, pressure T/(R w) = 37 kPa per N of tension).
- Ellipse with area conserved at w = 0.714: h = 0.35 to 0.39 mm.
- Panneerselvam 2024 cotton trend (h/d about 0.83 at 200 tex): 0.42 to 0.44 mm.
- Turan & Okur convention (b/a = 0.7, perimeter conserved): 0.42 to 0.44 mm.
- High-twist limit from Afrashteh 2013 (b/a = 0.86): 0.47 to 0.49 mm.
- Singal (arXiv 2302.13467) flat-plate fit for pearl 3/2, scaled to #5: 0.68 mm at 40 kPa. This is the upper tail. Its "free" diameter comes from a loose caliper reading that includes fuzz, the test is flat-plate on untensioned yarn, and its units are ambiguous.
- Taken: h = 0.42 mm (range 0.36 to 0.55).

STEP 2: force at the crossing (statics of a taut, flexible thread on a sphere).
- phi = arccos(R/(R+Delta)) = 7.2 deg for Delta = 0.30 mm and R = 38.2 mm.
- F = 2T sin(phi) = 0.25 T, about 0.25 N (25 gf) at T = 1 N.
- Pressure over a 0.71 x 0.71 mm patch: about 0.5 MPa (0.2 to 1.2 MPa for T = 0.3 to 2 N). That is about 13x the pressure under a lone laid thread.
- Tension is ASSUMED. Analogues: a hand-placed suture retains about 1 N (PMC3871579); machine-embroidery top thread is 1.0 to 1.5 N.

STEP 3: thread thickness at the crossing, t_c.
- (a) Bandara & Durur, 2-ply worsted crossing 2-ply worsted, tabulated in the Durur 2000 Leeds thesis (https://etheses.whiterose.ac.uk/id/eprint/4047/1/uk_bl_ethos_550542.pdf). Map by equal pressure: F_equiv = F x (0.193/0.356)^2 = 0.29 F, about 7 gf. At that load each worsted yarn is about 0.91 of its ply diameter, which for #5 gives 0.91 x 0.356 = 0.32 mm. Over T = 0.5 to 2 N the range is 0.28 to 0.36 mm.
- (b) Kawabata 1985 wire method (https://www.jstage.jst.go.jp/article/jte1955/31/1/31_1_7/_pdf): a tensioned yarn over a 0.5 mm wire is 0.79 to 0.85 x its close-packed diameter at 10 gf. The close-packed diameter of #5 is 0.43 mm, giving 0.34 to 0.37 mm, and about 0.40 mm at 0.5 MPa.
- (c) Singal: 0.58 to 0.60 mm (upper tail).
- Taken: t_c = 0.36 mm (range 0.30 to 0.48).

STEP 4: extra sink delta of the lower thread into the wrap under F.
- A Winkler (elastic foundation) model with lone-thread sink s0 = 0.01 to 0.03 mm gives 0.03 to 0.10 mm.
- TemariKai (paraphrase): kagari tension must not dent the mari, and the surface has only a little cushioned give (https://www.temarikai.com/HowToPages/ToolKit/kagari.html). That points to the low end.
- Taken: delta = 0.04 mm (range 0.02 to 0.10).

STEP 5: the rise.
- Delta = t_c + (t_c - h)/2 - delta = 0.36 - 0.03 - 0.04 = 0.29, about 0.30 mm.
- Low case (h 0.38, t_c 0.30, delta 0.10): 0.16 mm. High case (h 0.55, t_c 0.48, delta 0.02): 0.43 mm.
- Cross-check: the four independent source sweeps gave central values of 0.33, 0.29 to 0.34, 0.28 and 0.33 mm.
- The code at snapshot 85c96cd uses STACK_LIFT = 0.42 x 0.71 = 0.30 mm. That is the centre of this estimate, so the constant now has a derivation instead of a "studio nestle" label.

### stacking

This is n threads crossing at the same spot. m = n - 1 is the number of threads under the top one.

RULE: Delta(m) = Delta1 x [1 + k(m - 1)], with Delta1 = 0.30 mm and k = 0.85 (range 0.7 to 1.0). The build-up is nearly linear and mildly sublinear.

| Threads at the spot | Rise of the top axis, central | k = 0.7 to 1.0 | Full range |
|---|---|---|---|
| 2 | 0.30 mm | 0.30 | 0.22 to 0.40 mm |
| 3 | 0.56 mm | 0.51 to 0.60 | about 0.40 to 0.75 mm |
| 4 | 0.81 mm | 0.72 to 0.90 | about 0.55 to 1.1 mm |

EVIDENCE (SAYS):
- Afrashteh, Merati & Jeddi 2013 on fabric thickness at crossovers: "fabric thickness is approximately equal to the sum of the minor diameter" (https://nopr.niscpr.res.in/bitstream/123456789/19249/1/IJFTR%2038(2)%20126-131.pdf).
- Panneerselvam 2024, non-interlaced cotton stacks (paraphrase): thickness is close to linear in layer count. For 54 tex the per-layer height goes 0.180, 0.177, 0.173 mm at 5, 7, 9 layers. For coarser wefts it is 10 to 18% lower at 4 layers than at 2 (https://dergipark.org.tr/en/download/article-file/2626159).
- Bandara & Durur, crossed 2-ply worsted (Durur 2000, Table 3.2): t6/(3 x t2) = 0.82 to 1.02 at 7 to 30 gf per crossing, and 0.68 to 0.77 at 41 to 73 gf. Our pressure-equivalent load is about 3 to 17 gf, which is the near-linear regime.
- Embroidered crossed carbon-roving layers (paraphrase): 1, 3 and 5 layers were about 1, 3 and 5 mm thick (https://iopscience.iop.org/article/10.1149/1945-7111/acd1d8).
- Kawabata 1985 treats crossover thickness as additive.

WHY NEARLY LINEAR (COMPUTED):
- Threads crossing at an angle touch crown to crown at one point and cannot nest.
- The sublinear part comes from the cumulative load on the lower layers. Each thread above adds its own kink force, which is proportional to sqrt(its rise). So the bottom threads compress more and sink more into the wrap, by about 0.045 mm per extra thread; this is what k = 0.85 implies.
- A physics sweep that modelled this explicitly gave rise3/rise2 = 1.9 to 2.2 and rise4/rise2 = 2.8 to 3.3, i.e. k of about 0.9 to 1.1.

EXCEPTIONS:
- Nesting happens only when threads are nearly parallel. A thread lying in the groove between two touching parallel round threads adds about 0.87 of a full step (sqrt(3)/2). Flattened threads save less, because their groove is shallower. This matters near the kiku centre, where legs converge at small angles; tall small-angle stacks can also slide sideways, which no model here covers.
- Crossings at DIFFERENT spots along one thread do not add. A taut thread bridges them (see modelRule).
- The code's cap of 3 layers is a craft safety limit, not a sourced value.

### section

LAID (away from crossings), central values:
- Width w = 0.71 mm (SAYS: TemariKai gauge, 7 threads per 5 mm; the measuring method is not stated).
- Height h = 0.42 mm (range 0.36 to 0.55).
- w/h = 1.7 (range 1.3 to 2.0), i.e. h/w = 0.6 (range 0.5 to 0.77).

AT A CROSSING (both threads):
- Height t_c = 0.36 mm (range 0.30 to 0.48).
- Width by area conservation: w x h/t_c = 0.71 x 0.42/0.36, about 0.83 mm.
- So w/h is about 2.3 locally.

SHAPE, SAYS (paraphrased with links):
- Yarns inside fabric are modelled as an ellipse (Peirce 1937), a racetrack (Kemp 1958) or a lens (Hearle–Shanahan 1978), per the InTech 2012 chapter https://cdn.intechopen.com/pdfs/36900/intech-modeling_of_woven_fabrics_geometry_and_properties.pdf.
- Twist is the main control on flattening (Ozgen & Gong 2011, abstract). Measured b/a rose from 0.35 for untwisted yarn to 0.86 at high twist (Afrashteh 2013, filament yarn).
- Cotton in a plain weave: w/h = 1.34 to 1.48 (Tolubeeva 2012, https://ttp.ivgpu.com/wp-content/uploads/2015/10/338_14.pdf).
- Cotton in orthogonal stacks: h/d = 0.64 to 0.96, falling with coarser or plied yarn (Panneerselvam 2024).
- A common modelling convention is b/a = 0.7 for cotton (Turan & Okur 2013).
- 3-ply threads are close to round and 2-ply threads are flatter (AMANN wiki, https://www.amann.com/knowledgehub/amann-wiki/sewing-thread-construction-explained-types-properties-and-applications/).
- The owner's craft observation (spec §5, 17.09.2026): at a crossing the real thread squashes and lies wider than it is tall.

SHAPE, COMPUTED:
- Pearl is a high-twist 2-ply, so the moderate-to-high twist end applies: b/a of about 0.6 to 0.7.
- Physically the section is two plies of 0.36 mm whose pairing rotates along the ply twist. The height swings between about one ply (0.36 mm) and a squashed stacked pair within each half ply-twist pitch; this pitch was not measured. So successive crossings vary by about +/-0.05 to 0.1 mm depending on whether they land on a crown or a groove.
- For rendering, an ellipse or racetrack (superellipse with exponent about 2.5 to 3) with h/w = 0.6 is adequate. The pearl "beads" are a texture.
- The code at 85c96cd uses STITCH_FLAT = 0.5 (h = 0.36 mm, w/h = 2.0). That is at the flat end of the range; the central value is 0.6.

### lowerThread

COMPUTED (no measurement on a mari exists). At a crossing under about 0.25 N (T = 1 N):

- COMPRESSION: the lower thread compresses from h = 0.42 to t_c = 0.36 mm, i.e. -0.06 mm (-14%). The upper thread flattens at the contact the same way.
- EXTRA SINK into the wrap: delta = 0.04 mm (range 0.02 to 0.10), beyond a lone thread's sink s0 of 0.03 mm or less. The lone-thread sink is invisible, consistent with TemariKai's rule that kagari must not dent the mari.
- AXIS DIP: the lower thread's axis dips by d_low = delta + (h - t_c)/2 = 0.07 mm (range 0.03 to 0.14). Its top surface drops by about 0.10 mm.
- AXIS SEPARATION: the axis-to-axis separation at the crossing is t_c = 0.36 mm, so the upper thread's rise = 0.36 - 0.07, about 0.29 mm.
- LOCAL WIDENING: area conservation widens the lower thread locally to about 0.83 mm.
- DENT LENGTH: about half the upper thread's width (0.35 to 0.4 mm) plus the foundation decay length lambda = sqrt(R x s0) = 0.6 to 1.1 mm. So the dent's half-length is about 1 to 1.5 mm.
- UNDER A STACK: with m threads above, the bottom thread dips by about 0.07 + 0.045(m - 1) mm, i.e. 0.07, 0.12 and 0.16 mm for 1, 2 and 3 threads above. This is consistent with k = 0.85 in the stacking rule.

THE WRAP (partly SAYS):
- TemariKai (paraphrase) asks for a stitching surface with just a little cushioned give. It also estimates about 300 yd of sewing thread for a 24 cm ball.
- COMPUTED: 274 m of Tex 27 to 40 thread at package density 0.5 to 0.7 g/cm3 makes a skin only 0.6 to 1.2 mm thick over the yarn and batting.
- The only indentation data found are for drums pressing on wool packages (Durur 2000, Table 3.8): 0.18 to 2.2 mm radial deformation under line loads of 0.054 to 0.156 N/mm. Our crossing gives a comparable 0.03 to 0.25 N/mm spread over 2 to 4 mm, but a firm mari is stiffer than a soft wool package. That data is therefore only a loose upper bound, and delta near the low end is assumed.
- The stiffness of the wrap under a narrow load is the single largest unknown in the rise estimate.

### ballGrowth

Yes, this has been worked out. Textile engineering calls it package density and package build-up (the wound "package" is the body of thread on the core). The law itself is exact geometry. The empirical part is only the density, and winding tension moves it weakly.

1. LAW (volume conservation, exact):
   V = L x tex/rho_p.
   - Ball: R(L) = (R0^3 + 3 L tex/(4 pi rho_p))^(1/3). Thin-shell form: dR = L x A_eff/(4 pi R^2), with A_eff[mm2] = tex x 1e-3/rho_p[g/cm3].
   - Cylinder: D = sqrt(D0^2 + 4 L tex/(pi H rho_p)).
   - SAYS (paraphrase): Gramsch et al. 2022 fitted diameter vs wound length for cotton on precision winders. A square-root law fitted best (MSE 0.55, against 3.5 for a power law and 130 for a straight line), which is what constant density predicts (https://journals.sagepub.com/doi/full/10.1177/15589250211073249).

2. DENSITY vs TENSION (SAYS, measured):
   - Durur 2000 (R42/2 worsted): 8, 19, 30 gf gave 0.381, 0.435, 0.478 g/cm3 (+25% for 3.75x the tension). Density stayed about 0.47 to 0.49 from radius 41 to 81 mm, so earlier layers are hardly compacted further. Outer layers are the least dense (citing Wegener & Schubert).
   - El-Moursy et al. (open-end cotton): 23, 28, 30 cN gave 0.383, 0.400, 0.445 g/cm3.
   - HaUI 2024 (ring cotton): 10 to 30 cN gave +6 to 10%.
   - Typical ranges: cotton dye packages 0.36 to 0.40; precision-wound sewing thread 0.7 to 0.8 g/cm3.
   - Baseball (madehow): circumference 10.47 to 22.52 cm over about 337 m of yarn at very high tension. COMPUTED: rho_p about 0.6 g/cm3, using an assumed windings mass.

3. WHAT THIS SAYS FOR OUR THREAD (COMPUTED):
   - One layer adds t_layer = tex/(rho_p x pitch).
   - A parallel band of #5 at pitch 0.714 mm adds 0.28 mm averaged over the surface (packing 0.66). That matches the mean height of a flattened ellipse, (pi/4) x h = 0.28 to 0.33 mm for h = 0.36 to 0.42, which cross-checks the laid height.
   - A randomly cross-wound #5 at rho_p 0.45 to 0.75 would add 0.37 to 0.62 mm per coverage. The extra 0.1 to 0.3 mm is the cost of the crossings, the same order as the 0.3 mm crossing rise.
   - Tripling the tension changes a layer's thickness by only about 10 to 25%. So the crossing rise depends only weakly on kagari tension; geometry (twist, packing, crossings) dominates.
   - Pressure a wound layer puts on those below: T/(R x pitch) = 0.037 MPa per N for #5. The kagari is a single, outermost layer, so nothing compacts it later.
   - One gap-free #5 layer on a 24 cm ball takes 25.7 m, about one skein, and adds about 0.28 mm of radius (+1.75 mm of circumference).
   - The sewing-thread wrap adds 0.2 to 0.4 mm of radius per 100 m of 30 tex thread.
   - No separate "ball of string law" exists beyond this (a physics Q&A on it has no accepted answer).

### modelRule

This is for the renderer. Snapshot compared: 85c96cd (stitches.ts STACK_LIFT = 0.42, STITCH_FLAT = 0.5; kagari.ts stackBump). Status of the whole rule: designed from sources plus computation. It is not measured on pearl #5, not verified visually, and has no craft acceptance. Adopting it means updating spec §5 (the 17.09 entry and #93) in the same step.

Length ratios are written in terms of laid width w (pearl #5: w = 0.71 mm, TemariKai). They carry over to other threads only by assumption.

1. SECTION: ellipse or racetrack, w x h, with h = 0.6 w = 0.42 mm. Change STITCH_FLAT from 0.5 to 0.6 (range 0.5 to 0.77). Sources: Afrashteh 2013, Panneerselvam 2024, Turan & Okur 2013, Tolubeeva 2012, and the 2-ply geometry (computed).

2. SINGLE CROSSING:
   - Upper axis rise Delta1 = 0.42 w = 0.30 mm. Keep STACK_LIFT = 0.42; it is now derived (riseMm).
   - Axis-to-axis separation at the crossing S = t_c = 0.5 w = 0.36 mm, split as rise 0.30 up plus dip 0.06 to 0.07 down.
   - Optional: at the contact, draw both threads with height t_c and width w x h/t_c (about 0.83 mm) over +/- w/2.
   - If sections are not flattened, the drawn tubes overlap by h - Delta1, about 0.12 mm. That overlap is the real compression plus sink, not a bug.

3. STACK AT ONE SPOT: m threads underneath gives Delta(m) = Delta1 x [1 + 0.85(m - 1)], i.e. 0.30, 0.56, 0.81 mm. Keep the cap of 3; it is unsourced.

4. LIFT PROFILE along the upper thread (statics of a taut string on a sphere; bending length sqrt(B/T) is about 0.1 to 0.2 mm, so the string model holds):
   - Tent: Delta(x) = Delta x (1 - |x|/a)^2 for |x| < a, with a = f x sqrt(2 R Delta) and f = 0.85 (range 0.45 to 1.0; smaller for a softer wrap).
   - At R = 38.2 mm, a = 4.1, 5.5, 6.7 mm for Delta = 0.30, 0.56, 0.81.
   - Round the apex over +/- w/2. The flank angle at the apex is sqrt(2 Delta/R), about 7 deg.
   - Rigid-ball gap under the thread is 0.19, 0.10, 0.04 mm at 1, 2, 3 mm from the crossing. The thread therefore reads as lying on the ball, consistent with the owner's statement and commit f8c79aa.
   - Define a in mm, not as a fraction of leg length. The current midW = 0.045 x leg (about 1.6 mm) is too narrow. endW = 0.14 to 0.29 x leg is also a fraction and should become mm.
   - a scales as sqrt(R), i.e. x0.87 to 1.22 for C = 180 to 360 mm. The rise does not depend on R.

5. SEVERAL CROSSINGS AT DIFFERENT SPOTS along one thread: combine the tents by maximum (upper envelope), not by sum. Where two apices are closer than a_i + a_j, bridge them with a straight chord: height = linear interpolation between the apices + x(L - x)/(2R).
   - The current stackBump SUMS the sitA, sitB and mid bumps. A sum is right only for threads stacked at the same spot.

6. LOWER THREAD DENT:
   - Axis dips d_low = 0.1 w, about 0.07 mm, with profile d_low x (1 - |x|/b)^2 and b of about 1.2 mm.
   - Under m threads it dips 0.07 + 0.045(m - 1) mm.
   - This is optional at render scale; it matters for contact checks, where the separation should be t_c, not h.

7. NEAR-PARALLEL NESTING (small angle, two touching parallel threads below): use 0.87 x the step (round threads); flattened threads save less. The angle threshold is unsourced.

Parameter sources: Delta1, t_c and h come from the Durur 2000, Kawabata 1985 and Panneerselvam 2024 analogues via equal-pressure scaling. k comes from Durur, Panneerselvam and the IOP electrode stacking data. a comes from string statics. f and delta come from a Winkler model with the wrap stiffness guessed from TemariKai's qualitative rule. T = 1 N is assumed.

### uncertainty

MAIN UNKNOWNS, ranked:

1. Wrap stiffness under a narrow load (s0 and delta). It moves the rise from about 0.42 mm (rigid) to about 0.2 mm (soft). It is guessed from TemariKai's qualitative "a little give" and no-dent rule.

2. Pearl #5 laid height and crossing thickness. No cotton-pearl crossing data exist. The analogues are 2-ply worsted between rigid plates (Durur), worsted over a steel wire (Kawabata) and filament or cotton fabrics. The one pearl-cotton source (Singal, a flat-plate fit on a fuzzy caliper diameter with ambiguous units) points thicker (t_c about 0.58 mm) and is the reason for the 0.40 to 0.45 mm upper tail.

3. Natural variation along the ply twist: +/-0.05 to 0.1 mm per crossing. This is real scatter, not error.

4. Kagari tension (0.3 to 2 N, assumed from suture and machine-embroidery analogues). Its effect on the rise is weak once the wrap is fixed.

5. The stacking factor k (0.7 to 1.0). Small-angle nesting and sideways slip are not modelled, and the cap of 3 is unsourced.

6. The tent half-length a is exact only on a rigid ball. On the wrap it is 0.45 to 1.0 of that.

WHAT IS SOLID:
- The volume-conservation law and the string statics.
- The ranges of the textile data.
- The coincidence that the 2-ply envelope equals the TemariKai 0.714 mm gauge.

SOURCES NOT READ (paywalled or HTTP 403): Peirce 1937, Kemp 1958, Hamilton 1959/64, Ozgen & Gong, Kim 2021, El Messiry 2023, ASTM D204, Chen & Chou 2000.

MEASUREMENTS THAT WOULD SETTLE IT CHEAPLY:
- (a) Dial thickness gauge (ASTM D204 foot: 9.52 mm, 1.67 N, about 0.3 MPa on one thread, which is about the crossing pressure) on a single #5 thread. This gives t_c directly.
- (b) Micrometer on 2, 3 and 4 crossed #5 threads under a light plate. This gives k.
- (c) A macro side photo of 1 to 4 crossings on the real mari next to a ruler. This gives the rise and the tent length.
- (d) Weigh and measure the circumference of a spare mari before and after winding a known length of #5. This gives rho_p and the layer thickness.

## 3. Adversarial check

Holds as written: **False**.

### Problems found

VERDICT: The main answer survives. The central rise moves from 0.30 to about 0.28 mm, which is inside the synthesis's own range, and the ball-growth law checks out. Six specific claims do not hold: one formula has the wrong sign, the tension effect is understated, one derivation step contradicts its own inputs, one source trend is reversed, one quote is attributed to the wrong page, and the 4-thread stack value is too high. Re-opened: TemariKai gauge and kagari pages, Afrashteh 2013 (full text), Kawabata 1985 (tables read from page images), Durur 2000 thesis (Tables 3.2, 3.3, 3.4, 3.8), Panneerselvam 2024 (Tables 3–5), Gramsch 2022 (Table 1), Tolubeeva 2012. Code at 85c96cd confirmed: STACK_LIFT = 0.42 on d = 0.71 mm, STITCH_FLAT = 0.5, stackBump SUMS the bumps, cap min(3, ...), midW = 0.045, endW = 0.14 + 0.05·max(sitA, sitB).

CONFIRMED (quotes and units correct):
- TemariKai: "DMC Perle 5 - 7 threads = 0.5cm" (0.714 mm each).
- Afrashteh: "fabric thickness is approximately equal to the sum of the minor diameter". This is an experimental result on polyester filament (300 den), and b/a goes from 0.35 to 0.86 at twist factor 0 to 4600.
- Kawabata Table 2, 0.5 mm wire: D10 = 0.169 to 0.181 mm against a close-packed diameter of 0.213 mm, i.e. 0.79 to 0.85. The load is F_c = 2 F_y sin 30°. The paper states additivity only as an "assumption that the fabric thickness is equal to the sum".
- Durur Table 3.2: t6/(3·t2) = 0.82 to 1.02 at 7 to 30 gf per point, and 0.68 to 0.77 at 41 to 73 gf. Table 3.3 least-squares x/y = 0.77 to 1.23, mean 0.96.
- Durur Table 3.4: tension 8 → 30 g raised package density 0.381 → 0.478 g/cm3.
- Durur Table 3.8: package deformation 0.18 to 2.2 mm.
- Gramsch: square-root fit MSE 0.55, against 3.50 (power) and 130.37 (straight line).
- Tolubeeva: diameters 0.222/0.150 and 0.321/0.240, i.e. w/h = 1.48 and 1.34.
- Panneerselvam 54 tex: 0.180, 0.177, 0.173 mm.
- All ball-growth arithmetic: 25.7 m per layer, +0.28 mm radius, 0.58 to 1.2 mm thread skin, 0.37 to 0.62 mm per cross-wound coverage.
- Tent algebra: a = sqrt(2RΔ) = 4.8 mm, and gaps 0.19 / 0.10 / 0.04 mm on a rigid ball.

ERRORS:

1. [modelRule 5] Sign error. A chord lies INSIDE the sphere. The height of the bridge between two apices must be linear interpolation MINUS x(L−x)/(2R), not plus.
   - With "+" the thread would bulge upward between crossings.
   - Only the minus sign reproduces the synthesis's own tent Δ(1−|x|/a)² when a² = 2RΔ, and the bridging condition L < a_i + a_j.

2. [riseMm step 4] The Winkler step contradicts its own inputs.
   - A tensioned lower thread on a Winkler foundation spreads the load over a decay length λ = sqrt(R·s0), which gives δ = F·λ/(2T) = sqrt(2·Δ·s0).
   - With s0 = 0.01 to 0.03 mm this is 0.07 to 0.13 mm, not 0.03 to 0.10. The chosen δ = 0.04 needs s0 of about 3 µm.
   - The range can be rescued with an elastic half-space instead (E about 2 to 5 MPa, load spread over about 0.7 × 2 mm, minus the unloading under the upper thread's tent). That gives δ of about 0.03 to 0.07 mm.
   - TemariKai's kagari page only forbids tension that would "dent/alter the shape of the mari", i.e. the whole-ball shape. It cannot tell 0.02 mm from 0.10 mm, so it does not "point to the low end". The "a little cushioned give" wording is not on that page.

3. [riseMm step 3a] Inconsistent scaling. The worsted ply (0.193 mm) was sized at packing 0.55 and the #5 ply (0.356 mm) at 0.66.
   - Scaling at the same packing, by sqrt(tex/ρ), gives a factor of 2.03 (not 1.845) and F_equiv = 0.244·F, about 6 gf.
   - Durur's measured 2-layer data at 5.6 to 7.2 gf are t2 = 0.37 to 0.35 mm. So t_c = t2/2 × 2.03 ≈ 0.37 mm, not 0.32.
   - Kawabata scaled the same way gives 0.36 to 0.39 mm.
   - So t_c is about 0.37 mm (0.33 to 0.41). The low end of 0.30 is not supported.

4. [section / step 1] The laid height is underestimated, and the cross-check is circular.
   - Kawabata's D0 (near-zero load) of 0.220 to 0.252 mm scales to 0.45 to 0.51 mm for #5.
   - An unloaded 2-ply's mean height is d_ply(1 + 2/π) = 0.58 mm.
   - So h is about 0.46 mm (0.42 to 0.50), i.e. h/w about 0.65 (0.6 to 0.7). The synthesis's 0.42 is at the flat end.
   - The "band 0.28 mm = (π/4)h" check only works for h = 0.36 at packing 0.66. h = 0.42 would need packing 0.56, so the check does not confirm 0.42.

5. [section] The Panneerselvam trend is reversed. h/d RISES with coarser yarn: 0.64 (54 tex, 2-ply), 0.73, 0.80, 0.85 (227 tex), 0.88 (306 tex, 2-ply), 0.96 (336 tex, 3-ply).
   - The value used, 0.83 at 200 tex, is still right.
   - These heights are yarn heights inside stacked crossings under a thickness gauge, not the height of a lone laid thread.

6. [uncertainty item 4, ballGrowth] The claim that the rise depends only weakly on tension is refuted.
   - At a crossing, the thread compression and the sink into the wrap both scale with T.
   - Using the Durur log-fit t2 = 0.484 − 0.067·ln(F in gf), self-consistent with F = 2T·sqrt(2Δ/R), the rise is 0.36 / 0.28 / 0.19 mm at T = 0.5 / 1 / 2 N.
   - With a firm wrap it is 0.37 / 0.30 / 0.22 mm.
   - Tension is a first-order input, on a par with wrap stiffness. The package-density analogy (+25% density for 3.75× tension) does not carry over to a concentrated crossing load.

7. [stacking] The build-up gets more sublinear as the stack grows, and the claimed sweep result (rise ratios up to 2.2 and 3.3, i.e. k > 1) contradicts the mechanism.
   - The bottom thread carries the sum of the kink forces above it: about 1, 2.3 and 3.9 × F1 for 2, 3 and 4 threads. The extra kink force comes from the increase in each rise.
   - Explicit recomputation gives Δ(3)/Δ(1) = 1.79 to 1.83 and Δ(4)/Δ(1) = 2.4 to 2.5. So k is about 0.8 for 3 threads and about 0.73 for 4.
   - The central 4-thread value of 0.81 mm is 10 to 20% high.
   - The bottom-thread dip is not +0.045 mm per thread. It is 0.09 / 0.18 / 0.27 mm for a central wrap (0.07 / 0.13 / 0.18 for a firm one).

8. [modelRule 4] f = 0.85 (range 0.45 to 1.0) has no basis. A soft wrap shortens the tent only through Δ − s0: a = sqrt(2R(Δ − s0)), so f = 0.95 to 1.0. The foundation transition, with λ about 1 mm, lengthens the tail rather than shortening it.

NOT RE-CHECKED (not re-opened): Singal (the only basis for the 0.40 to 0.45 mm tail, which the corrected derivation does not need), the IOP electrode stacking, El-Moursy, HaUI, the suture-tension analogue, and madehow.
- DMC skein weight was not confirmed. Ball listings (10 g for 49 to 53 yd) give 206 to 223 tex, consistent with "#5 = 5 m/g" = 200 tex; this is under a 5% effect on diameters.
- No direct measurement of a pearl-thread crossing height was found. There is no contradicting measurement, and none that confirms the value.

### Corrected result

Status: designed from sources plus computation, at snapshot 85c96cd. Nothing here is measured on pearl #5, verified visually, or accepted by the maker. Inputs: R = 38.2 mm, laid width w = 0.71 mm (TemariKai gauge), 200 tex, T about 1 N (assumed).

RISE AT ONE CROSSING (the upper thread's axis, relative to where it lies away from the crossing):
- Δ1 = t_lower + t_upper/2 − h/2 − δ = 0.37 + 0.185 − 0.23 − 0.045 = 0.28 mm, i.e. 0.39·w.
- Likely range 0.21 to 0.34 mm. This is the 5th to 95th percentile of a Monte Carlo over T = 0.6 to 1.6 N, h = 0.42 to 0.50 mm and wrap compliance 0.08 to 0.35 mm/N. Outer band 0.15 to 0.40 mm.
- Tension matters: 0.36 / 0.28 / 0.19 mm at T = 0.5 / 1 / 2 N.
- Inputs:
  - t_c = 0.37 mm (0.33 to 0.41). Source: Durur 2-layer data scaled by sqrt(tex/ρ) = 2.03 at F_equiv = 0.244·F, about 6 gf; Kawabata gives 0.36 to 0.39.
  - h = 0.46 mm (0.42 to 0.50). Source: Kawabata D0 scaled.
  - δ = 0.045 mm (0.02 to 0.08). Source: elastic half-space, E about 2 to 5 MPa. This input is guessed and is the largest unknown together with T.
  - Kink force F = 2T·sqrt(2Δ/R), about 0.24 N at 1 N of tension.
- STACK_LIFT: the re-derived centre is 0.39. The existing 0.42 (0.30 mm) is inside the range and may stay, but it is not the centre.

STACKING at one spot (m = threads underneath):
- Δ(m) ≈ Δ1·m^0.85, i.e. 0.28 / 0.50 / 0.71 mm for 2 / 3 / 4 threads (ranges 0.21 to 0.34 / 0.40 to 0.60 / 0.55 to 0.85 mm).
- It is near-linear but increasingly sublinear: k is about 0.8 for 3 threads and about 0.73 for 4. The reason is that the bottom thread carries the sum of the kink forces above it.
- Evidence (SAYS): Durur x/y = 0.96 on average, and t6/(3·t2) = 0.82 to 1.02 at our load; Afrashteh and Kawabata treat crossings as additive.
- Nesting applies only to near-parallel threads (0.87 step for round threads). The cap of 3 is unsourced.

SECTION:
- Laid: w = 0.71 mm, h = 0.46 mm (0.42 to 0.50), h/w about 0.65 (0.6 to 0.7). STITCH_FLAT = 0.5 is too flat for a laid thread.
- At a crossing: t_c = 0.37 mm, local width about 0.85 to 0.9 mm (area conserved), so h/w is about 0.42 there.
- A 2-ply swings between one ply (0.36 mm) and a stacked pair along each half ply-twist pitch, which gives ±0.05 to 0.1 mm of real scatter from one crossing to the next.
- Twist controls flattening (Afrashteh). Coarser cotton flattens LESS (Panneerselvam: h/d from 0.64 to 0.96).

LOWER THREAD:
- Compresses from 0.46 to 0.37 mm (−20%) and sinks δ = 0.045 mm more.
- Axis dip = δ + (h − t_c)/2 = 0.09 mm (0.05 to 0.13). Axis-to-axis separation is about 0.37 mm.
- Under 1 / 2 / 3 threads above, it dips 0.09 / 0.18 / 0.27 mm (firm wrap: 0.07 / 0.13 / 0.18).
- Dent half-length is about 1 to 1.5 mm.

BALL GROWTH (holds as written):
- V = L·tex/ρ_p, R(L) = (R0³ + 3L·tex/(4π·ρ_p))^(1/3).
- Density rises weakly with tension (Durur +25% for 3.75× tension).
- Gramsch: a square-root law fits cylinder packages best.
- One gap-free #5 layer = 25.7 m and adds about 0.28 mm of radius.
- This weak effect applies to whole layers. It does NOT make the crossing rise insensitive to tension.

RENDERER RULE:
1. Section h/w = 0.65.
2. Single-crossing rise 0.39·w, about 0.28 mm; 0.42 is acceptable.
3. Same-spot stack: Δ1·m^0.85.
4. Tent Δ(1 − |x|/a)² with a = f·sqrt(2RΔ), f = 0.95 to 1.0, i.e. a = 4.4 to 4.6 / 5.9 to 6.2 / 7.0 to 7.4 mm for 2 / 3 / 4 threads. Define a in mm, not as a fraction of the leg. The current midW of about 1.6 mm is too narrow.
5. Crossings at different spots combine by MAX, not by sum. The current stackBump sums them. Bridge apices closer than a_i + a_j with height = linear interpolation − x(L − x)/(2R) (MINUS).
6. The lower-thread dent is optional, but contact checks should use a separation of about t_c.

CHEAP MEASUREMENTS THAT SETTLE IT:
- A dial gauge (ASTM D204 foot) on one #5 thread gives t_c.
- A micrometer on 2 to 4 crossed threads gives the stacking exponent.
- A macro side photo of 1 to 4 crossings on the real mari, next to a ruler, gives Δ and a.
- Any of these at two stitching tensions gives the tension slope.

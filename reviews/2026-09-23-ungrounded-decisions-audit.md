# Аудит решений «со слов» — 23.09.2026

Снимок: `85c96cd`. Зачем: владелица 23.09 — законы модели обосновываются только техникой вышивки
(источники), физикой или логикой, не её словами (`AGENTS.project.md`, «Законы модели — только с
обоснованием»). Три поисковика нашли 35 решений, опиравшихся на пересказ её слов; шесть агентов
искали каждому основание; сводка ниже. **Статус: результат аудита, независимо не перепроверен.**
Правки документов (раздел «Doc edits») **не применены** — сначала проверить, затем вносить по одной с
ссылкой сюда. Сырые ответы — английский текст ниже; где аудит спорит с текстом HANDOFF, решает
проверка по источникам, а не этот файл и не прежняя договорённость.

## Коротко (по-русски)

- **Обоснованы** (заменить «владелица сказала» на источники): шаг ряда = 1× ширина уложенной нити;
  верхний стежок на нить ниже и шире; прокол нижней точки там, где уложенная нить пересекла
  разметку; ноги прямые между точками удержания; нет провалов между близкими пересечениями;
  порядок шитья в стопке; шаг крутки перле 3,6 диаметра.
- **Опровергнуты:**
  - прокол верхней точки «на пересечении укладки с меридианом» (в коде давно `tInner` = прежний +
    одна нить; документы и комментарии описывают не то, что работает);
  - «игла выходит где угодно, прокалывая пучок» — противоречит GT16 и закону 6 (#105);
  - цель у верхнего острия в HANDOFF/`spec/pile-render.md`/#103/#104 в четырёх частях: «2-й ряд не
    ложится на 1-й» (внутри клина ложится — это и есть uwagake), «лесенки нет совсем» (по логике и
    ремеслу рост есть в первых рядах и выходит на плато; неверна величина 5,6 мм ≈ 16 высот сечения
    при границе плотной укладки ~3–5), «ноги отходят плавно», «ноги не стягиваются в клин»;
  - отказ от прототипа с поворотом двухпрядного сечения «потому что рост останавливается только к
    7-му ряду» — его плато 1,6 мм внутри границы укладки; настоящие дефекты прототипа (свободный
    поворот, предел 75°, время сборки) причиной не записаны;
  - «круглое несжимаемое сечение» как закон (годно только как объявленная идеализация);
  - подъём в стопке на полную высоту сечения с профилем в одну ширину.
  - `pierceOnMeridian` в мастерской фактически не срабатывает: действует «прежний + 2 мм» постоянно;
    на этой константе стоят ёмкость круга, ~10 кругов до экватора и базовые счёты тестов.
- **Гипотезы:** величина нижнего шага S8 `2r/sin(α/2)` (верхняя граница острого V); прочтение
  «+1–2 мм» GT14 от естественного пересечения; «подъём ~0,1 мм», «нить от шара не отходит»
  (исследование #93 даёт 0,28 мм и «шатёр» — [docs/thread-over-thread.md](../docs/thread-over-thread.md));
  глубина и форма короткого подхвата.
- **Код на опровергнутом/необоснованном** — раздел «Code risks»: `s8-kiku.ts` нижний шаг,
  `upper-kiku.ts` 2 мм, `pierceOnMeridian`/`kikuFlank`, хвост hermite к нижнему проколу,
  `gatherUnderBite`, высоты `pile-heights.ts`, `STACK_LIFT`/`STITCH_FLAT`.


## Verdict table

Snapshot: codex/temari-next @ 85c96cd (read-only; line numbers checked against it). Status: grounded / refuted / hypothesis; split statuses are marked. The grounds column cites only sources, physics and logic.

| # | Decision | Where | Status | Grounds | What to change |
|---|---|---|---|---|---|
| 1 | Kiku row pitch on the flank body = 1× laid thread width: rows side by side, no gap, no overlap; 1.5× rejected (D1) | patterns.ts:481-486; kagari.test.ts:351; pickup-volume.test.ts:52-54; assumptions.md:26; STATE.md:21; HANDOFF.md:321, :455-459; kiku-capabilities.md:60 (D1); next-steps.md:36-39; journal.md:185-186; reviews/2026-09-23-kiku-loop-review.md:77 | grounded | **Craft sources:** Toolkit uwagake (each round parallel to the last, about one thread width lower and wider); Stretch the Points (normal allowance ≈ one thread width, no open space between stitches); Basics (threads aligned next to each other); Thread gauges (#5 = 7 threads per 0.5 cm, so 0.71 mm is the side-by-side lay pitch); Страна Мастеров, Jarilo 2013 (placed too close, the thread climbs onto the previous row). **Logic:** parallel rows with no gap and no overlap put the centres one laid width apart. 1.5× leaves about 0.35 mm open, against "no open space". **Limits:** the sources say "about". 0.71 mm is a laid width, not a round diameter (craft-sources.md:53). | Keep the value. Replace "craft 22.09 / owner 22.09 / отклонён владелицей" with these citations. The GT14 quote at assumptions.md:26 is about the top stitch, not flank spacing, so re-cite it. Treat body spacing (a hard contact rule) separately from the upper step Δ (row 2). |
| 2 | Upper stitch goes one thread lower on the line, about one thread wider per round, needle under the whole bundle of its own group (D3). Includes "1.5× rejected" applied to this step | kiku-capabilities.md:62 (D3); patterns.ts:852-856 (tInner); STATE.md:21 | grounded (the rule); hypothesis (exact Δ = 1.0; "own group only") | Toolkit uwagake steps 4 and 6, and GT14: about one thread width lower and wider; the stitch goes around all earlier threads. Photos (China Silk Museum and others in craft-questions.md) give Δ ≈ 1–1.5 threads. "Own group only" is the project's inference from the kousa page (В2); no source states it. | Cite Toolkit and GT14. Make Δ a parameter: nominal 1, range 1–1.5. Mark "own group only" as an inference. |
| 3 | Lower point: lay the thread from the upper stitch along its natural line and pierce where it crosses the marking line. That crossing is the stretch (D2 principle). The GC/port clearance is dropped | s8-kiku.ts:51-59; assumptions.md:14; s8-control-kiku.md:43-49; next-steps.md:36-39; journal.md:185-186; HANDOFF.md:456-458; kiku-capabilities.md:61 (D2) | grounded (lower points only) | **Stretch the Points:** where the lay crosses the marking line is generally where the stitch goes; thicker thread and sharper angles need more stretch; there is no fixed rule. **Uwagake & Kiku:** the thread goes where it must lie and the stitch is placed there; about 2 mm for #5 below the previous round. **Toolkit:** about 2 mm, not a constant. The GC/port clearance had no craft basis. | Replace "Craft (owner 22.09)", "(22.09, владелец)" and "Укладка (владелец)" with these links. Restrict the rule to lower points. Delete "Численные проверки, требовавшие иного, могут быть неверны относительно craft" and "Прежние проверки под 1½× могут быть неверны". |
| 4 | The same lay ∩ meridian rule used for upper (inner) pierces ("Inner pierce = packed lay ∩ meridian"; "pierce under the tip bundle at the natural guideline crossing") | assumptions.md:27; HANDOFF.md:322-326; stitches.ts:396-401; journal.md:185 (worded as general) | refuted | **Sources:** GT14 and Toolkit step 6 set the top stitch from the previous stitch (one thread lower and wider), not from the lay (craft-questions В1/F3; Olympus TM-6/7/8, Orlova and China Silk Museum agree). **Logic:** the thread is carried over the bundle, so its lay crosses the line on top of the bundle, where there is no wrap to pierce. **Project record:** 17dc431 used lay ∩ meridian and put later ports on earlier threads; 7bf0902 went back to tInner = previous + one pitch. | Reword: upper stitch k sits one thread below stitch k−1 on the line (GT14, Toolkit); the lay crossing applies to lower points only. Mark HANDOFF.md:322-326 as history, superseded by 7bf0902. |
| 5 | Size of the S8 lower advance: 2r/sin(α/2) ≈ 3.4 mm (r = 0.2, 13.6° V), taken from the round-0 V and used for every row; "no stretch beyond this" | s8-kiku.ts:51-59, :378-395; s8-kiku.test.ts:93-94; assumptions.md:14; s8-control-kiku.md:43-49; next-steps.md:36-39; upper-kiku.ts:27 (overrides to 2) | hypothesis (an upper bound for a sharp V, not a craft value) | **Logic:** 2r/sin(α/2) is the apex shift of a sharp V whose two straight arms are each offset by one diameter. Rounded nested tips (GT14o) give a value between d and d/sin(α/2). **Sources:** about 2 mm for #5, measured from the previous stitch, and not a constant. At GT14 geometry the V-pack for #5 is about 6.0–6.3 mm. **Photo readings conflict:** GT14i puts the round-2 lower stitch about 4–6 mm below round 1; the finished GT14 shows about 7–10 rounds per colour over ~20 mm, i.e. 2–2.9 mm per round; GT14n shows 6–7 threads per band. **Geometry:** the V opens with each row (the ideal crossing falls from 3.39 to 2.67 mm by row 7, at ~17°), so a constant taken from round 0 is not the lay rule. **Contradiction:** S8's 3.4 mm for a 0.4 mm thread exceeds the craft ~2 mm for the thicker #5, while the source says thinner thread needs less. | Relabel lowerRowAdvanceMm as a "sharp-V estimate, upper bound", not craft. For rows beyond 2, compute each row from both actual previous arms. Make the test at :94 a diagnostic. Settle the value by measuring lower-stitch spacing per round against V angle, on a scaled GT14-placement photo or a stitched 24 cm sample. |
| 6 | Studio outer pierce: kikuFlank uses pierceOnMeridian (snug flank ∩ guideline), with a floor of prevOuter + stretch (2 mm) | patterns.ts:446-453, :631-656, :833-851, :496-499; assumptions.md:27; kiku-capabilities.md:61 (D2 status); HANDOFF.md:456-458 | refuted as implemented. The rule actually in effect is "previous + 2 mm, constant" | **Scratch run on 85c96cd** (kikuSpec simple/even/fit, C 24 cm, 0.71 mm): pierceOnMeridian is given the parallel offset of one arm only. That offset lies pitch·cos β off the outer meridian and never reaches it, so the fallback returns the nearest sample, only +0.08–0.24 mm away. max(prev + 2 mm, natural) therefore returns exactly +2.000 mm on every ring (40.71, 42.71 … 58.71, then the 59.75 ceiling). The "0.1–0.25 mm natural shift" in R10 is this fallback, not geometry. **Sources:** TemariKai says the stretch is not a constant. **Geometry:** the true two-arm crossing is ≈ pitch/sin β ≈ 6.4 mm at ring 1. | In the docs, state the effective law: previous + stretchMm, constant; a calibrated parameter until measured; not the lay crossing. Delete the stale D2 status "пол 0,85·pitch побеждает". Do not switch to the true crossing until row 5's measurement is done: it would reach the equator in about 4 rounds. |
| 7 | R10 reading: GT14's "stretch an extra 1–2 mm" is measured beyond the natural lay crossing | craft-questions.md:143 (R10) | hypothesis (the reading is open); its premise is refuted | Stretch the Points and the Toolkit measure about 2 mm from the previous stitch and put the stitch at the lay crossing. GT14's "extra" most plausibly means beyond the ordinary one-thread spacing. The model's "natural 0.1–0.25 mm", which made R10 look suspicious, is the fallback artifact from row 6. | Rewrite R10 (see docEdits). |
| 8 | No corridor kept for a future exit: the needle pierces the wrap or bundle and may exit anywhere; "leave must not occupy future ports" was the wrong goal | HANDOFF.md:362-371; stitches.ts:396-401; assumptions.md:24 | refuted for "exit anywhere, piercing the bundle"; "no empty corridor reserved in advance" is consistent with the sources | **GT16:** gently separate earlier threads; do not catch or split them. **GT14, Uwagake & Kiku:** stroke the interwoven threads downward with the needle eye to keep room for stitching. **Toolkit:** the stitch goes around all earlier threads, so the needle passes under the bundle and enters and leaves beside it. **Basics:** small, centred bite; do not split the line. Room is made at stitch time by moving laid threads. | New rule: ports only in free wrap or between threads. A pierce on a laid thread is a defect (HANDOFF.md:107, fd05afd). Room comes from grooming (R6), which the model lacks, so a leave that covers the next port means an operation is missing; it does not license a pierce. Rewrite or remove assumptions.md:24 (the tip-gate was removed in c540039). |
| 9 | Needle-eye smoothing is a UX hint, not geometry (D6) | kiku-capabilities.md:65 (D6); craft-questions.md R6 | the step is grounded; its classification is refuted | Uwagake & Kiku and GT14: stroke the threads between the upper points downward with the needle eye to open room. This moves laid threads, so it is a geometric operation on earlier material. | Reclassify D6 as a geometric operation. Link it to rows 8 and 29. |
| 10 | Uwagake: the working thread is carried over the bundle before the top stitch, and the stitch goes around all of it. Shitagake: the thread stays under the bundle (D5, D4a) | kiku-capabilities.md:64 (D5); stitches.ts:396-399 | grounded; the "short segment inside the wedge ≈ stitch width" is a hypothesis | Toolkit uwagake steps 2 and 4, and photo 04. GT14: the working thread always goes over the earlier threads. TemariKai shitagake Toolkit: the working thread stays under, and the next stitch sits closely under the previous one. The segment length is a photo estimate (В3). | Cite these sources. Mark the segment length as a hypothesis to measure on close-ups. |
| 11 | Upper-tip target: "rows lie side by side; row 2 does not lie on row 1" | HANDOFF.md:121; spec/pile-render.md:104; #103 check | grounded along the flank; refuted inside the wedge window at the upper tip | **Along the flank:** Toolkit parallel lay; Orlova lesson 6 (rows do not climb onto each other). **At the tip:** Toolkit steps 2 and 4 and GT14 carry round 2 over round 1 and stitch around both. **Logic:** the arrive crosses over the bundle and the leave crosses back over the arrive, so row 2 lies on row 1 for about one stitch width. That is what "uwa" (over) names. | Split the target: side by side along the flank; over the bundle inside the wedge window. Acceptance must treat these crossings as required, not as defects. |
| 12 | "No staircase at all": the maximum height at the upper tips must not grow from row to row; the criterion "growth stops by row 7" is rejected | HANDOFF.md:121; spec/pile-render.md:101; #103; public/design.html:248-251 | refuted as "zero growth"; grounded by logic as "grows over the first rows, then levels off"; the plateau value is a hypothesis | **Packing count:** stitch k encloses 2(k−1) legs of its set in a window about (k+1) thread widths wide (Toolkit; GT14 rate). The packed depth is 2(k−1)/(k+1), which stays under 2 layers (0.7 at k = 2, 1.6–1.8 at k = 10). **Bound:** add the arrive and leave on top and the total is about 3–5 section heights: ≈1.4–1.8 mm with the studio's 0.355 mm section, ≈2.1–3.6 mm with a round 0.71 mm one. **Why not zero:** zero growth would need the stitch to widen about 2 threads per round, which the GT14 photos rule out. **Current model:** the measured 5.3–5.7 mm (~16 section heights) exceeds every bound, so it is a model artifact (no compaction under the stitch loop; full-height lifts). | Replace with: height grows over about 3–4 rounds and then plateaus within a packing bound (a hypothesis until measured). Measure with calipers across opposite kiku centres after 0…10 rounds, or with a side-view macro at rounds 3, 6 and 10. Update the status text in design.html. |
| 13 | Rolling two-ply section prototype not accepted because it "stopped growing only after row 7" | HANDOFF.md:122-123; spec/pile-render.md:88-97, :101-102; reviews/2026-09-23-pile-section-prototype.patch | refuted (the stated reason); the prototype itself is not grounded either | A plateau after a few rows is what the packing count in row 12 predicts, and the prototype's 1.6 mm at row 10 sits inside that bound. Its own defects are real: the ply plane rotates freely at each point, while perle is a tightly twisted 2-ply cord whose ply plane turns with the twist (NeedlenThread). The 75° cap has no basis, and the first build takes twice as long. | Give these real reasons. Keep the patch as a candidate if its rotation follows the measured twist pitch and flattening; judge it against the packing bound. |
| 14 | Legs run straight between hold points | HANDOFF.md:121-122; #107, #101 | grounded | **Physics (string statics):** T·κ equals the sideways load, so an unloaded span is straight (a geodesic on a smooth sphere). **Friction limit:** geodesic curvature ≤ μ/R (slippage criterion from filament winding), so the bow over a span L is at most μL²/(8R): ~0.001 mm over 0.7 mm and ~0.16 mm over 10 mm (μ = 0.5 assumed). **Craft:** lay the thread, then stitch where it lies (Uwagake & Kiku); petal sides are straight (GT14). | Keep. Hold points include every later stitch that goes around the leg and every later thread pressing on it. μ is an unmeasured parameter. |
| 15 | Legs leave the braid gradually, without sharp bends | HANDOFF.md:122; spec/pile-render.md:103-104; patterns.ts:940-990 (gatherUnderBite blend) | refuted as a target; a gradual turn only where laid neighbours support the leg is a hypothesis | **Physics:** a taut thread turns only where a force acts. Friction holds sideways curvature of at most μ/R (a radius of 76–190 mm or more at μ = 0.2–0.5). Turning about 0.4 rad, from the wedge edge (26.6°) to the flank (47–51°), would need 30–76 mm of curve. So the turn happens at the last stitch that encloses the leg: the "Y" in the masters' photos (R5). **Below one thread diameter:** bending stiffness rounds the corner (√(B/T) ≈ 0.1–0.3 mm; B unmeasured). | Replace with: bends happen only at hold points. The bend at the last holding stitch (~20°) follows from the GT14 widths and the one-thread step. The smoothStep return into packed bands has no hold point. |
| 16 | "Legs are not squeezed into a narrow wedge" (given as a cause of the staircase) | spec/pile-render.md:103; #104 text | refuted | Toolkit and GT14 name the interwoven inverted-V wedge as the hallmark of uwagake; В3 confirms it across TemariKai, Russian and Chinese sources. A half-angle of atan(0.5) = 26.6° follows from +1 thread in total per one-thread step, and matches the ~26° measured on finished GT14 pieces. | Rewrite: the defect is the return below the stitch (row 15), not the wedge. |
| 17 | Wedge width rate: +1 thread in total per round (half-angle ~27°), cornerMm·(2+overs). The per-side version from c2b7691, cornerMm·(2+2·overs), was reverted | patterns.ts:1110-1131; kiku-capabilities.md:63 (D4); assumptions.md:28; night-queue.md:54 | grounded ("in total", as a GT14 calibration); per-side refuted | **GT14 text:** "about 1 thread width wider" means a width that grew by one in total. **Room between points:** per side, the width 1.42k mm exceeds the room between neighbouring A and B upper points (2π·s_k/8, from 3.92 to 8.81 mm) from round 4 (5.68 > 5.57 mm), so stitches would overlap the other set (kousa: no weaving through; GT16: do not split threads). **Angles:** per side gives a 45° half-angle, about the flank angle, so there would be no separate wedge. In total gives 26.6°, close to the ~26° measured. | Keep the revert. Label the rate as a GT14 calibration. Long-term, the width should be what encloses the bundle, checked against the room to neighbouring points (#104; angle-dependent for GT12). Mark night-queue.md:54 as reverted by fd05afd. |
| 18 | A later top stitch's leave rises out of its own port and lies over the arrive (the chidori X). The 22.09 tip-gate is removed | stitches.ts:497-503; night-queue.md:47; c540039 | grounded | **Toolkit step 4:** carry the thread over the bundle, then stitch around all of it. The needle enters on the far side and exits on the arrive side. From that exit the thread is on the surface, since only a needle pass puts thread inside the wrap. **Topology:** the zigzag continues, so the leave crosses the arrive and the bundle; being later, it lies on top. TemariKai chidori photo 02 and uwagake photo 5 show this. | Keep. Record the Toolkit topology argument and link at night-queue.md:47 and stitches.ts:500. The frame is the observation this rule explains. |
| 19 | Keep the round, incompressible thread section as the model until a sourced compression model exists | HANDOFF.md:740; journal.md:119; spec/embroidery-model.md:197; assumptions.md:16-17; next-steps.md:100; #93 | refuted as physics; valid only as a declared zero-parameter idealisation | **Textile mechanics:** yarn is a fibre assembly with voids and flattens at crossings, even when highly twisted (Behera et al. 2012 §2.2.5). Peirce 1937 used an elliptical section and Kemp 1958 a racetrack. Cotton yarn sections in fabric are lens-shaped (J. Text. Inst. 102(3), 2011). Pearl #5 is a two-ply twisted cord. **Base:** TemariKai Kagari says too much tension dents the mari, so the base gives way. **Method:** "no unsourced coefficients" is a sound rule, but it favours no particular section. | Recast as a limiting idealisation with a known direction of error: it overstates lift and pile height and understates laid width. List the studio's STITCH_FLAT 0.5 and STACK_LIFT 0.42 as a second unsourced idealisation (visual basis, 8c2e70a). assumptions.md:17 ("1 диаметр") is stale. Settle by measurement (#93). |
| 20 | Lift over a crossing ≈ 0.1 mm per layer, braid ≈ 0.3 mm, and #103's ≈ 2.8 mm tangent span | assumptions.md:29 (last column); #103; 83b0c2e | hypothesis (no grounds) | No temari source gives heights (R9). Physics bounds the lift between 0 and one diameter (0.71 mm) for round #5 on a rigid base; flattening and a dentable mari reduce it, but no law gives 0.1 mm. Adding layers linearly is unsupported: in Peirce's geometry h1 + h2 = D for one interlacement, and nested flattened sections need not add. The 2.8 mm span scales as √h and inherits the unsupported input. | Remove 0.1 and 0.3 mm. Show the span as a formula or a range (h from 0 to 0.71 mm gives 0 to ≈7.4 mm). Measure with calipers per round, and with a macro side photo with a mm scale of #5 crossing #5 (1–3 stacked) at kagari tension. |
| 21 | Current pile lift: every crossing lifts by the full section height, with an elliptical profile one width wide (vertical walls). The slope-limit envelope was reverted as looking like "wire"; waves were deferred together with compression and sinking | pile-heights.ts:30-31, :42-45, :118-123, :140-143; HANDOFF.md:180-185; night-queue.md:56; 2c026b0 | refuted | **Statics:** nothing pushes the thread down off the surface, so it cannot descend a near-vertical elliptical wall ~0.71 mm wide. On a convex ball a lift h is bridged by a tangent ≈ √(2Rh) on each side: ≈5.2 mm at 0.355 mm (R 38.2 mm), ≈21 mm for the 5.62 mm stack. **So:** the "wire" look is what statics predicts for full-height incompressible lifts on a rigid ball; it counts against the heights, not against the slope limit. **Load at a crossing:** ≈ 2T√(2h/R), which flattens the lower thread (Kemp) and dents the wrap (Kagari). | Record the current lift as physically impossible and the likely cause of the 5.6 mm staircase. Frame #93 as one coupled equilibrium: tension, compression of the lower thread, indentation of the wrap, tangent bridging. Revisit the slope-limit rollback on these grounds. |
| 22 | Narrow lift zone with dips between neighbouring crossings rejected: a taut thread does not dip between crossings | HANDOFF.md:123; 17144cf | grounded | **Statics with push-only contact:** without an inward load, h″ ≤ 1/R. A dip between crossings L apart is at most L²/(8R): ≈0.003 mm at 0.9 mm spacing (R 38.2 mm). The thread touches down only if L > 2√(2Rh): ≈5.5 mm at h = 0.1 mm, ≈10.4 mm at 0.355 mm. This also holds on a soft wrap (decay length √(T/k) ≥ √(hR)). **Exceptions:** a pierce, or a later thread pressing on it. | Replace the attribution with this physics. Acceptance: no local minimum of height between crossings closer than 2√(2Rh), unless a pierce or an overlying thread is there. |
| 23 | The thread never leaves the ball: it lifts only at the crossing | f8c79aa; #103 (assumptions.md:29 already keeps √(2Rh)) | hypothesis, contradicted by rigid-ball and linear-wrap statics | A lift Δ above the neighbouring contact must spread over at least 2√(2RΔ). The only way to confine it is a wrap that is deeply indented and stiffens sharply under compression, and neither property has been measured. The same conditions would also allow dips (row 22). | Keep in #103 as a hypothesis, with √(2Rh) as the physics baseline. Settle with a side photo (lift length) and a wrap-indentation test. |
| 24 | Local-envelope variant rejected: the thread must not hug each bump and press straight back; the whole span between catches has to be solved | spec/needle-route.md:105; public/design.html:227-231; next-steps.md:11 | grounded | **Statics:** string equilibrium d(T·t)/ds + f = 0 with push-only contacts. A concave-outward return onto a rigid mari would need a pulling force. **Peirce geometry:** a taut free span is straight segments plus contact arcs (Behera et al. §2.1). **Craft:** Basics asks for a smooth, taut thread. Tension and contacts couple the whole span, so this is a boundary-value problem, not a window around a mark. | Replace "владелец справедливо указала" with this physics. Note that a whole-span solver needs wrap compliance (Kagari: tension dents the mari); the return length is of order √(T/k). |
| 25 | Pile render by sewing order is the default: a later thread lies above, and goes under only at a needle pass or in underpassing. ?pile=0 keeps the old lifts | ball.tsx:30-34; HANDOFF.md:74, :175; night-queue.md:59; spec/pile-render.md (Правило); #102; b25d014, 2e294d9 | grounded (the ordering only) | **Craft:** GT14 always carries the working thread over earlier threads; Toolkit photo 02; TemariKai kousa: the woven look comes from layer order, not needle weaving (orime kake is the exception); underpassing only at the last stitch (polygons page). **Physics:** threads cannot pass through each other; the old path has 49,788 near-pairs, the pile 0. **Logic:** only a needle pass can put a later thread under one fixed at both ends. | Replace the approvals at HANDOFF.md:74 and :175 with these grounds. State that the lift size (row 21) and frozen earlier threads (row 29) are not grounded. Recipe variants that pass under by needle (uwagake variation #3, orime kake) must enter the crossing ledger as needle operations. |
| 26 | Inside the mari the thread follows the straight needle, not the smooth gaussian descend | assumptions.md:36; HANDOFF.md:475-477; stitches.ts:345-349 | grounded for long hidden passes and for "no gradual surface dip, sharp bend at the port"; hypothesis for the shape and depth of a short bite | **Logic and statics:** a sewing needle is a rigid straight rod, and a taut, unloaded thread is straight, so long hidden travel (2–5 cm) is a chord. On the surface the thread runs straight to its port and bends there. **Sources on bites:** Basics and Kagari give only a tiny 1–2 mm bite with the needle perpendicular to the line; "stitch deeply" applies only to hidden travel. No source gives the path or depth of a bite. | Replace "Владелец:" and "Craft:" with this argument. Mark bite depth as open. |
| 27 | Planned implementation: chords from each port to depth d ≈ 1–1.2 mm, a buried segment, then back up, described as the "straight needle"; NEEDLE_DEPTH_MM = 1 | HANDOFF.md:508-515; stitches.ts:31-35, :345-349; assumptions.md:23, :25 | refuted as a "straight needle"; the depth is a hypothesis | **Geometry:** a straight chord between ports c apart lies at most c²/(8R) below the surface: ≈0.005 mm at c = 1.2 mm, 0.013 mm at 2 mm (TemariKai bite), 0.024 mm at 2.7 mm (R 38.2 mm). A three-segment path to 1 mm depth is a bent path. It needs a needle rotated inside the ball or a deforming wrap, and no source gives either. **After the pull:** tension draws the buried part toward the chord, under the overlying wrap strands. | Do not implement it under the "straight needle" label. Record bite depth as an open hypothesis; physics predicts it is shallow, just under the outer wrap strands. Settle with a cut section or peel-back of a stitched test ball with contrasting wrap layers and a mm scale. |
| 28 | S8 rule 1, variant 1 (numerical): earlier rounds come from their finest accepted level; the later round's ladder refines only its own windows; every level is still checked as a full thread | s8-control-kiku.md:58, :275-277; HANDOFF.md:701; s8-kiku.ts:189-191, :861-879 (1472a65) | grounded (logic) | **Logic of convergence testing:** a refinement ladder must vary one discretisation at a time. Rebuilding round 1 at every level carried its x2 KKT ambiguity (1.3e-2 mm) into round 2 as a 6.15e-3 mm length change, against a 2e-3 tolerance. **Evidence:** round 1 passes its own ladder, and the finest earlier level's residual propagates within tolerance (full-rebuild x3→x4: 1.1e-4 and 4.1e-4 mm, below 2e-3). | Replace "решение владельца / владелец выбрал" with this reasoning. Keep reporting the x3→x4 sensitivity, since that is what licenses the rule. Valid only inside the frozen-earlier model (row 29). |
| 29 | Physical premise: earlier rows already lie in place and are a fixed obstacle for later rounds ("Физически ранние ряды уже лежат"; B solved against a fixed A) | s8-control-kiku.md:58, :276-277; HANDOFF.md:701, :794; s8-kiku.ts:643-651; s8-kiku-ab2.ts; next-steps.md:100; assumptions.md:15 | refuted as physics; usable as a named idealisation | **Craft:** in Toolkit step 4 the later top stitch goes around all earlier threads and pulls them into the wedge. GT14 and Uwagake & Kiku have laid threads stroked with the needle eye, so they move. The recipe's own gatherUnderBite moves them too (В3/F7). **Physics:** by Newton's third law, a thread pressed by a later one changes its equilibrium. | Add to assumptions.md as "idealisation: earlier material is a frozen obstacle", with its known contradiction at same-set upper tips. It may be acceptable for A/B crossings between tips (R3). Test with the joint equilibrium solve (HANDOFF.md:688): do round-1 legs move less than 0.02 mm under round 2? |
| 30 | S8 rule 4: the finest level is rebuilt with twice as many constraint probes (8 instead of 4) at the same thresholds, replacing the cover/2 check | s8-control-kiku.md:170, :205; HANDOFF.md:583, :685; s8-kiku.ts:151-152, :865, :877 | grounded (logic) as a KKT-point sensitivity check; weak as a representation check | **Logic:** if the finest solution moves less than the tolerance when probes double, it is not a probe-placement artifact at that tolerance. **Weakness:** the 8-probe grid contains the 4-probe grid, and feasibility between probes is already certified by the continuous gap check (rule 2), so in practice it catches a change of KKT point. The 0.02 / 0.002 mm thresholds are engineering tolerances. | Replace "(решение за владельцем)" and "(решение владельца)" with the stated purpose. For a real sampling test, add a shifted, non-nested probe set (5 or 7 per span). |
| 31 | The kiku capability matrix is the engineering specification | kiku-capabilities.md:3; docs/workshop-brainstorm.md:18 | grounded as product scope only; it is not a ground for any geometric rule | Which capabilities the game has is a product choice. The goal "embroider what the craft sources describe" rests on the sources cited in the B rows (Toolkit, GT14, Orlova, Olympus). Handing it over grounds none of the rules in table D. | Replace with a scope statement. Add a "Источник" column to table D. |
| 32 | Perle #5 twist pitch = 3.6 diameters (~40° helix); the old value was 1.8 (60°) | stitches.ts:992-1007; assumptions.md:19; 4c462b5 | grounded (measurement plus helix geometry) | **Helix geometry:** tan θ = π·d/p, so 43° corresponds to 3.37 d and 1.8 d to 60.2°. **Measurement:** macro photos of DMC perle #5 give 3.4 (ply slope) and 3.7–3.9 (band count); yarn twist data give 4–6 d. A 60° helix is what makes a cord look like hard rope. | Reword the last comment sentence as history. Add the photo URLs. Keep the 3.4–6 d range. |

## Refuted — what each breaks

Refuted decisions and what each one breaks at 85c96cd:

1. **Lay ∩ meridian used for upper pierces** (row 4)
   - assumptions.md:27, HANDOFF.md:322-326, the stitches.ts:396-401 comment and journal.md:185 still describe the inner pierce as the lay crossing. The code uses tInner = previous + one pitch (7bf0902).
   - Anyone who follows these docs brings back 17dc431, which put later ports on earlier threads.

2. **Studio pierceOnMeridian as implemented** (row 6)
   - The model claims to "pierce at the lay crossing", but in fact places each outer stitch at previous + 2 mm, the same on every ring. TemariKai says the opposite: the stretch is not a constant.
   - Built on that constant: the round capacity (patterns.ts:496-499, toRim = floor(span/stretch)), the ~10 rounds to the equator, the kagari.test.ts crossing-count baselines ("measured after natural outer pierce"), and R10's "suspicious 0.1–0.25 mm" (a fallback artifact).
   - The true crossing, if implemented without calibration, would move the equator to about 4 rounds.

3. **"Needle exits anywhere, piercing the bundle; reserving free ports is the wrong goal"** (row 8)
   - HANDOFF.md:362-371 declared the port-clearance goal wrong. That pushed the work toward piercing laid threads, against GT16 and the Toolkit.
   - It conflicts with the project's own defect rule, "a pierce on an earlier thread is a defect" (HANDOFF.md:107, fd05afd), and with #106's "прокол между нитями".
   - The missing operation, grooming with the needle eye (R6), stays invisible.

4. **Upper-tip acceptance target in HANDOFF.md:121-124, spec/pile-render.md:101-104 and #103/#104** (rows 11, 12, 15, 16). Four parts are refuted:
   - "Row 2 does not lie on row 1" at the tip.
   - "No staircase at all" (zero growth).
   - "Legs leave gradually, without sharp bends".
   - "Legs not squeezed into a narrow wedge".

   Together they define a target that a faithful uwagake model must fail. The carry-over crossing and the woven wedge are the defining features of the technique. The target pushes work toward removing the wedge, and toward smooth curves with no hold point, which the recipe already has (gatherUnderBite blend) and which is what makes the "sharp bend below" look. It hides the real defect: full-height lifts with no compaction under the stitch loop give 5.6 mm, about 16 section heights, against a packing bound of about 3–5.

5. **Rejection of the rolling two-ply prototype for "stopping growth only after row 7"** (row 13). This discarded the only prototype whose height levelled off, and its plateau of 1.6 mm sits inside the packing bound. Its real defects (free rotation, the 75° cap, build time) are not recorded as the reason.

6. **Round, incompressible section as a law** (row 19)
   - It blocks any compression work in #93 and presents a known-false idealisation as physics.
   - The studio does not even use it: STITCH_FLAT 0.5 and STACK_LIFT 0.42 are a second unsourced idealisation, with about 0.06 mm of tube overlap by construction.
   - assumptions.md:17 ("1 диаметр") is stale. The idealisation inflates lift and pile height.

7. **Full-height elliptical lift with vertical walls, and the rollback of the slope limit as "wire"** (row 21)
   - The render keeps a lift profile that is physically impossible for a taut thread, and it is the likely source of the staircase.
   - The one physically correct change, tangent bridging, was rolled back because of how it looked.

8. **The planned "straight needle" implementation** (row 27)
   - HANDOFF.md:508-515 would encode a bent path (chords to 1 mm depth plus a buried segment) under the name "straight needle".
   - It would overstate each bite's hidden length by roughly 1–2 mm in the metrage (≈2.3–3.2 mm modelled vs a ≈1.2 mm chord at halfBite 0.6).
   - It would present an invented depth as craft. NEEDLE_DEPTH_MM = 1 and the "Craft:" label at stitches.ts:345-349 already do this.

9. **"Earlier rows already lie" as physics** (row 29)
   - S8 row2/A2/B2 and "B against a fixed A" cannot form the wedge at same-set upper tips, because the later stitch never gathers the earlier legs.
   - Presented as physics, this idealisation hides why S8 row 2 has no wedge. The numerical acceptance of A1/B1 is not affected.

10. **D6 "needle-eye smoothing is a UX hint"** (row 9). It removes from the geometry the operation that makes room for later upper stitches, so collisions near the tips get blamed on other rules.

11. **Per-side widening, c2b7691** (row 17). Already reverted in code by fd05afd, but night-queue.md:54 still records it as done. Re-applied, from round 4 it would put the stitches of one set onto the other set's bundle.

12. **"Checks that required otherwise may be wrong relative to craft" / "not more authoritative than the lay"** (rows 3 and 5). This dismisses numerical evidence on the strength of an unsourced magnitude (the 3.4 mm V-pack). The valid version is narrower: a check that passes only with a gap is measuring renderer clearance, not craft.

## Doc edits (not applied)

All edits apply to codex/temari-next @ 85c96cd. Russian replacement text is given in quotes.

**docs/assumptions.md**

- **:14** (нижний шаг ряда), column «На чём держится»: replace with «**принцип — craft**: нить укладывают от верхнего стежка, стежок — там, где она пересекла разметку (TemariKai Stretch the Points; Uwagake & Kiku; Toolkit: ~2 мм для №5, не константа). **Величина `2r/sin(α/2)` — гипотеза**: вершина острого V при прямых фланках на касании, верхняя граница; скруглённые вложенные острия дают меньше; постоянная из V круга 0 не равна пересечению укладки в следующих рядах (V раскрывается). Зазор под GC-порты отклонён: ремесленного основания не имел».
  - Last column: replace «ремесленная приёмка за владельцем» with «величину решает замер шага нижних стежков по кругам (фото GT14 в масштабе или образец 24 см)».
- **:15**: replace with «**идеализация**: ранний материал — неподвижное препятствие; противоречит Toolkit (поздний верхний стежок охватывает и стягивает прежние ноги) и приглаживанию ушком иглы (GT14, Uwagake & Kiku)».
  - Last column: «плотность второго ряда; клина у верхних остриёв S8 row2/A2/B2 в этой идеализации нет».
- **:16**: replace with «**идеализация без параметров, физически заведомо неверная**: пряжа сплющивается на перехлёстах (Peirce 1937, Kemp 1958, Behera et al. 2012 §2.2.5); завышает подъём и высоту стопки, занижает ширину уложенной нити».
- **:17**: replace with «`STACK_LIFT = 0,42` при `STITCH_FLAT = 0,5` — студийная идеализация без источника (визуальный подбор, 8c2e70a); трубки перекрываются ~0,06 мм по построению. Гипотеза, не обосновано; решает замер #93».
- **:23**: append «прямая хорда между портами 1,2–2 мм на R ≈ 38 мм лежит ≤ 0,005–0,013 мм под поверхностью: глубина 1 мм — не «прямая игла», а гипотеза».
- **:24**: delete the row (the tip-gate was removed in c540039), or replace its last column with «прокол и выход — только в свободной намотке или между нитями (GT16, Toolkit, Basics); место открывает приглаживание ушком иглы (GT14, Uwagake & Kiku, R6) — в модели этой операции нет».
- **:26**: replace «На чём держится» with «**craft + логика**: Toolkit uwagake (круг параллельно прежнему, примерно на нить ниже/шире), Stretch the Points (обычный запас ≈ ширина нити, без просветов), Basics (нити рядом), Thread gauges (7 × №5 = 0,5 см → 0,71 мм — шаг укладки рядом); вплотную без зазора и без наложения → шаг осей = ширина укладки; 1,5× оставлял просвет ~0,35 мм. Шаг верхнего стежка Δ — параметр: текст «about 1», фото 1–1,5».
- **:27**: replace with «**Фактически действует: предыдущий + `stretchMm` (2 мм), постоянно** — калиброванный параметр до замера. `pierceOnMeridian` получает смещение одного фланка, оно не пересекает меридиан, возврат — ближайшая точка (+0,08–0,24 мм). Пересечение укладки (Stretch the Points) — только для нижних точек и не реализовано. Внутренняя метка — `tInner` = предыдущий + одна нить (GT14, 7bf0902)».
- **:28**: append «ставка +1 нить в сумме — калибровка GT14, не общий закон».
- **:29**: add «нынешний эллиптический подъём шириной в нить физически невозможен для натянутой нити». In the last column, replace «при ~0,1 мм на слой … ~0,3 мм» with «величина — гипотеза: от 0 до 0,71 мм (круглое №5 на жёсткой основе), пролёт касательной √(2Rh) — от 0 до ≈7,4 мм; измерить (#93)».
- **:36**: replace with «**Направление:** длинный скрытый ход — хорда (игла — жёсткий стержень; натянутая нить без поперечной нагрузки прямая); на поверхности нить идёт прямо к порту и ломается у него. Для короткого подхвата прямая хорда почти не уходит под поверхность (c²/8R); глубина подхвата — гипотеза».

**HANDOFF.md**

- **:74**: replace «острия на 2–4 рядах владелица одобрила» with «порядок укладки обоснован (GT14, Toolkit, TemariKai kousa; нити не проходят друг сквозь друга); величина подъёма — нет (#103, #93)».
- **:175**: delete «(кадры владелицы: «заметно лучше»)».
- **:182-185**: replace with «Ограничение крутизны подъёма откатили за вид «проволокой»; по статике нити это ожидаемо: при полных подъёмах без сжатия и вдавливания пролёт касательной √(2Rh) ≈ 5 мм. Эллиптический подъём во всю высоту сечения физически невозможен и вероятно даёт лесенку. Сжатие, вдавливание клина и касательные пролёты — одна задача равновесия (#93)».
- **:121-124**: replace with «Цель у верхнего острия: вдоль фланка ряды лежат рядом (Toolkit, Orlova ур. 6); в окне клина новый круг идёт поверх пучка своей группы, стежок охватывает весь пучок (Toolkit шаги 2/4, GT14) — эти перехлёсты обязательны. Высота у острия растёт первые ~3–4 круга и выходит на плато в пределах упаковки пучка (оценка 3–5 толщин сечения — гипотеза до замера). Ноги прямые между точками удержания и поворачивают у последнего охватывающего стежка («Y», R5). Подъём над пересечением не обоснован — #103, #93. Проверено и не принято: узкая зона подъёма с провалами — натянутая нить без внешней нагрузки не проседает между пересечениями ближе 2√(2Rh) (статика нити). Поворот двухпрядного сечения (патч в `reviews/`) не принят: плоскость прядей поворачивалась свободно, а не по шагу крутки; предел 75° без основания; первая сборка вдвое дольше».
- **:321**: replace «(craft; 1,5× отклонён)» with «(Toolkit, Stretch the Points, Basics, Thread gauges; 1,5× оставляет просвет)».
- **:322-326**: prefix with «**[снято 7bf0902, история]**» and add «ставил поздние порты на прежние нити; верхний стежок — на нить ниже предыдущего (GT14, Toolkit)».
- **:362-371**: replace the «Поправка модели (владелец, 22.09)» paragraph with «**Правило портов (GT16, GT14, Uwagake & Kiku, Toolkit, Basics):** игла входит и выходит в свободной намотке или между нитями, под пучком, не расщепляя нитей; пустой коридор заранее не резервируют — место открывают при шитье, приглаживая нити ушком иглы (R6). В модели этого шага нет, поэтому уход, закрывающий порт следующего круга, — дефект (нет операции), а не разрешение прокалывать; прокол по уложенной нити — дефект (:107, fd05afd)».
- **:455-459**: replace with «Шаг ряда кику — 1× ширина уложенной нити (Toolkit, Stretch the Points, Basics, Thread gauges); 1½× оставлял просвет. Нижний прокол — где укладка пересекла разметку (Stretch the Points), только для нижних точек; `2r/sin(α/2)` — оценка острого V (верхняя граница), гипотеза. В студии фактически действует «предыдущий + 2 мм» (assumptions:27). Проверка, проходящая только с зазором, меряет зазор рендера, а не ремесло».
- **:475-477**: replace «Владелец: нить следует прямой игле…» with «Основание: игла — жёсткий прямой стержень, натянутая нить без поперечной нагрузки прямая; длинный скрытый ход — хорда; на поверхности нить идёт прямо к порту и ломается у него, без гауссова нырка. Для подхвата хорда между портами лежит на ≤ c²/8R (≈0,01 мм) под поверхностью — глубина подхвата неизвестна (гипотеза)».
- **:508-515**: insert before step 2: «**Это не «прямая игла»:** хорды до глубины d и отрезок на глубине — ломаная; не реализовывать как закон до замера глубины (срез пробного шара); метраж такого пути завышает скрытую длину подхвата на ~1–2 мм».
- **:583 and :685**: replace «(решение за владельцем)» and «(решение владельца)» with «(правило 4 ловит смену точки KKT: сетка из 8 проб содержит сетку из 4; для проверки выборки нужна сдвинутая сетка 5/7)».
- **:701**: replace «Решение владельца — вариант 1» with «Вариант 1 (`1472a65`) — логика проверки сходимости: лестница меняет одну дискретизацию; ранний круг принят своей лестницей; чувствительность x3→x4 1,1·10⁻⁴ / 4,1·10⁻⁴ мм < 2·10⁻³. Предпосылка «ранние ряды неподвижны» — идеализация (assumptions:15)».
- **:740**: replace «Решение владельца: оставить круглое несжимаемое сечение…» with «Круглое несжимаемое сечение — идеализация без параметров, физически неверная (Peirce, Kemp, Behera §2.2.5), завышает подъём; параметры сжатия — замер (#93)».

**spec/s8-control-kiku.md**

- **:43-49**: replace with «**Укладка ряда (Stretch the Points, Toolkit, Uwagake & Kiku):** нижний стежок — где нить, уложенная от верхнего стежка параллельно прежней, пересекла разметку; ~2 мм для №5, не константа. `2r/sin(α/2)` (~3,4 мм при r = 0,2) — оценка острого V с прямыми фланками на касании, верхняя граница, гипотеза; не прежний зазор под GC». Delete the last sentence («Численные проверки, требовавшие иного…»).
- **:58**: replace «(с 17.09, вариант 1, решение владельца)» with «(с 17.09, вариант 1: лестница меняет одну дискретизацию; в рамках идеализации «ранний материал неподвижен»)».
- **:170 and :205**: replace «решение за владельцем» with the purpose sentence from HANDOFF:583.
- **:275-277**: replace «владелец выбрал вариант 1» with «выбран вариант 1 (логика проверки сходимости)». Replace «Физически ранние ряды уже лежат» with «В модели ранний материал — неподвижное препятствие (идеализация: в ремесле поздний верхний стежок стягивает прежние ноги, Toolkit шаг 4)».

**spec/pile-render.md**

- **:88-97**: record the prototype's real non-acceptance reasons: free rotation, not tied to the twist pitch; the 75° cap has no basis; the first build takes twice as long.
- **:101-107**: replace with «**Вывод 23.09, исправлено.** Рост у верхних остриёв без предела недопустим; плато после нескольких кругов ожидаемо: стежок k охватывает 2(k−1) ног в окне ≈(k+1) нитей — меньше 2 слоёв, плюс приход и уход, итого ≤ 3–5 толщин сечения. 5,6 мм — артефакт: полные подъёмы без сжатия под петлёй стежка. На карте острия: веер поперёк косички в рендере и возврат ног в «полосы» гладкой кривой без точки удержания (`gatherUnderBite`). Клин — признак uwagake (Toolkit, GT14), не дефект; внутри окна клина 2-й круг лежит на 1-м по технике».

**spec/kiku-capabilities.md**

- **:3**: replace with «Объём способностей — продуктовый выбор: то, что описывают цитированные источники ремесла. Таблица D — законы, каждый со своим источником».
- **Table D**: add a column «Источник»:
  - D1: Toolkit, Stretch the Points, Basics, Thread gauges.
  - D2: Stretch the Points, Uwagake & Kiku, Toolkit, GT14.
  - D3: Toolkit, GT14; «своя группа» — вывод из kousa.
  - D4: Toolkit + арифметика + фото GT14.
  - D5: Toolkit uwagake/shitagake; длина участка — гипотеза.
  - D6: Uwagake & Kiku, GT14.
- **:61 D2 status**: replace with «фактически «предыдущий + 2 мм»: `pierceOnMeridian` не находит пересечения (смещение одного фланка), возврат — ближайшая точка». Delete «пол 0,85·pitch побеждает».
- **:65 D6**: replace with «геометрическая операция: сдвигает уложенные нити, открывая место (Uwagake & Kiku, GT14)».

**spec/needle-route.md:105 and public/design.html:227-231**

- Replace «владелец справедливо указала на другую крайность» with «по статике нити это другая крайность: вогнутый наружу участок обратно к мари требует тянущей силы, а контакт только давит; форма — задача на целый пролёт (Peirce; Behera §2.1)».

**public/design.html:248-251**

- Replace the status with «у верхних остриёв высота растёт ~0,5 мм за ряд до ~5,6 мм — больше, чем может дать упаковка пучка (≤ 3–5 толщин); причина — полные подъёмы без сжатия под петлёй стежка; нужна модель сечения и сжатия (#93)».
- Then run `node scripts/sync-design.mjs --write` and `--check`, and check the page at narrow width.

**spec/embroidery-model.md:197**

- Keep it as an observation. Add «объясняется физикой пряжи: сплющивание сечения (Kemp 1958; Behera §2.2.5); круглое сечение — идеализация».

**docs/next-steps.md**

- **:36-39**: replace with «**Укладка (Toolkit, Stretch the Points):** вплотную по ширине нити без просвета; нижний прокол — на пересечении укладки с разметкой (только нижние точки); `pitch = 1×`; нижний шаг S8 `2r/sin(α/2)` — оценка острого V, гипотеза». Delete «Прежние проверки под 1½× могут быть неверны».
- **:100**: append «(обе — идеализации: круглое несжимаемое сечение физически неверно; неподвижность ранней нити противоречит Toolkit)».

**docs/craft-questions.md:143 (R10)**

- Replace the model column with «~2 мм от предыдущего стежка (Stretch the Points, Toolkit), стежок — на пересечении укладки; добавляется ли «extra» GT14 сверх пересечения — открыто. «Естественные» 0,1–0,25 мм модели — артефакт возврата `pierceOnMeridian`, не геометрия».

**docs/night-queue.md**

- **:47**: add the ground: «Toolkit шаг 4 + топология: выход на стороне прихода, дальше по поверхности; кадр — наблюдение, которое правило объясняет».
- **:54**: add «откатано fd05afd: +1 с каждой стороны перекрывает стежки соседних остриёв с 4-го круга; GT14 — +1 в сумме».
- **:56**: add «откатано по виду; по статике «проволока» — ожидаемый вид полных подъёмов без сжатия; пересмотреть (#93)».

**docs/journal.md:119, :185-186 and reviews/2026-09-23-kiku-loop-review.md:77**

- These are historical, so do not rewrite them. Append a dated correction: «23.09: ссылки на слова владелицы — не основание; основания и статусы — docs/assumptions.md».

**STATE.md:21**

- Add the citations (Toolkit, Stretch the Points, Thread gauges, GT14).

**Code comments** (docs in code)

- s8-kiku.ts:52-58: «Craft (owner 22.09)» → «Stretch the Points: pierce at the lay crossing; 2r/sin(α/2) is a sharp-V upper-bound estimate, not a measured craft value».
- patterns.ts:446-453, :481-485, :633-634, :834, :842-846: re-cite, and state the effective law.
- stitches.ts:345-349: drop «Craft:».
- stitches.ts:396-401: rewrite as in HANDOFF:362.
- stitches.ts:1004-1005: reword as history, and add the photo URLs.
- kagari.test.ts:351, pickup-volume.test.ts:54 and s8-kiku.test.ts:93: replace «owner 22.09» / «craft pack» with the sources, or with «diagnostic».

**Issues** (same stage, per AGENTS.md)

- #103: remove 0.1 and 0.3 mm; show 2.8 mm as the formula √(2Rh) with a range; replace «высота не растёт от ряда к ряду» with the plateau criterion; «row 2 on row 1 inside the wedge» is required; mark «never leaves the ball» as a hypothesis.
- #104: the cause is the return without a hold point, not the «узкий клин».
- #93: frame it as one coupled equilibrium, with a measurement plan.
- #106: add grounds for each law.

## Code risks

Code resting on refuted or hypothesis decisions (85c96cd):

1. **s8-kiku.ts:51-59, :378-395 (lowerPackedAdvanceMm) and s8-kiku.test.ts:93-94**
   - The sharp-V upper bound 2r/sin(α/2) is taken from the round-0 V and applied as a constant to every lower row.
   - The comment calls it craft, and the test locks in 3.4 mm as correct.
   - Risk: row spacing for rows beyond 2 is wrong (the V opens), and so is A2/B2 geometry. The A2/B2 rejection in s8-ab.json stands on other grounds.

2. **upper-kiku.ts:27 (lowerRowAdvanceMm: 2)**
   - No grounds for this value.
   - It is inconsistent with S8's own formula, which gives about 6 mm for r = 0.355 in that V.

3. **patterns.ts:631-656 (pierceOnMeridian) and :833-851 (kikuFlank)**
   - The parallel offset of one arm never crosses the outer meridian, so the fallback silently returns the nearest sample, which is the flank end.
   - The law actually in effect is max(prev + stretch, ~prev + 0.1–0.2 mm), i.e. a constant +2 mm.
   - The JSDoc at 446-453 and the comments at 633-634, 834 and 842-846 describe a law that does not run.
   - Built on the constant stretch: patterns.ts:496-499 (toRim = 1 + floor((ceiling − firstOuter)/stretch)), the fit and round counts, and the kagari.test.ts crossing-count baselines ("measured at this density after natural outer pierce").
   - Fixing it to intersect both arms would give about 6.4 mm at ring 1 and reach the equator in about 4 rounds. Change it only after the calibration measurement, or keep it and declare 2 mm an explicit parameter.
   - ceiling = equator − 0.35·pitch and firstOuter = outer + pitch are engineering values.

4. **patterns.ts, the tail after :852 (hermite into the lower pierce)**
   - The 1× body is grounded.
   - The tail that joins it to a 2 mm lower pierce can bring centrelines closer than d near the lower tips (D2 already reports tube intersections there).
   - Add a non-interpenetration contract (spacing ≥ 1× near the tip, achieved by bending).

5. **patterns.ts:940-990 (gatherUnderBite)**
   - The wedge is grounded. The "thread radius clear" margin and the smoothStep return into packed bands over blend = 2·thread below the stitch have no hold point.
   - This is non-physical, and it is the likely source of the "sharp bend below" artifact.
   - #104 should replace it with hold points and a bend at the last enclosing stitch.

6. **pile-heights.ts:30-31, :42-45 (elliptical profile), :118-123, :140-143, and the ball.tsx:30-34 default**
   - Every crossing lifts by the full section height, with a one-width elliptical ramp and no compaction under the stitch loop.
   - The ramp violates h″ ≤ 1/R, and the missing compaction produces the 5.6 mm staircase (~16 section heights against a packing bound of 3–5).
   - The ordering in PILE_RENDER is grounded; the heights are not.

7. **stitches.ts:14-25 (STACK_LIFT 0.42, STITCH_FLAT 0.5)**
   - Two unsourced visual constants. Because 0.42 < 0.5, tubes overlap by about 0.06 mm by construction.
   - They contradict the round tube that the lab uses (spatial-contact.ts, s8-kiku.ts r = 0.2, upper-kiku.ts r = 0.355), and assumptions.md:17 describes them wrongly.

8. **stitches.ts:31-35 (NEEDLE_DEPTH_MM = 1), :345-349 ("Craft: straight needle… elliptical drop to the bury floor") and the plan at HANDOFF.md:508-515**
   - The current drop is neither straight nor sourced.
   - Implementing the plan would encode a bent path and overcount hidden length per bite by about 1–2 mm in the metrage (thread-path ThreadZone piercing/buried).

9. **stitches.ts:394-401 (?pile=0 path)**
   - The comment asserts both refuted rules: upper pierce at the natural guideline crossing, and the needle piercing wherever needed.
   - The stackClear, tip-gate and lift0 heuristics rest on render clearance, not craft. They are harmless only because the pile path is the default. They are on HANDOFF's removal list (step 2), which should go ahead.

10. **s8-kiku.ts:643-651 and s8-kiku-ab2.ts (B solved against a fixed A)**
    - The frozen-earlier idealisation cannot produce the gathered wedge at same-set upper tips.
    - Any S8 acceptance near the upper tips beyond one round is conditional on it. A joint equilibrium check is needed (HANDOFF.md:688).

11. **s8-kiku.ts:151-152, :865, :877 (rule 4)**
    - The 8-probe set contains the 4-probe set, so rule 4 mostly detects a change of KKT point and does not test sampling.
    - Low risk: A1/B1 acceptance rests on rules 1–3 and the continuous certificate.

12. **patterns.ts:1110-1131 (cornerMm·(2+overs))**
    - Grounded only as a GT14 calibration. For other point angles (GT12) or divisions it is not a law; width should come from the bundle it encloses, checked against the room to neighbouring points.

13. **kagari.test.ts:351, pickup-volume.test.ts:52-54**
    - The assertions are fine, but the justification is the owner. Re-cite them.
    - The crossing-count baselines inherit the constant-stretch artifact from item 3.

Not at risk (grounded): the 1× flank body pitch; the pile sewing-order default; c540039, leave rising from its own port (stitches.ts:497-503); PERLE_TWIST_PITCH 3.6; the in-total wedge rate; S8 rule 1 variant 1 as a numerical protocol.

## Appendix: the 35 decisions found

**1. In the S8 control, each later lower stitch moves along the ray by the snug V-pack advance 2r/sin(α/2) (about 3.4 mm at r=0.2). The rule is to lay the thread flush, with no gap, then pierce where it naturally crosses the marking line. The earlier 'GC/port clearance' step is rejected.**

- Where: spec/s8-control-kiku.md:43-49 (also docs/assumptions.md:14, docs/next-steps.md:36-39); snapshot 85c96cd, origin dd58047
- Stated basis: «Укладка ряда (22.09, владелец): сначала нить кладут вплотную … затем протыкают»; next-steps «Укладка (владелец)». assumptions.md:14 now labels the same rule «craft» with no source and «отклонена 22.09». Commit dd58047: «Owner craft 22.09». Sources exist for 'lay, then find the pierce point' (Stretch the points, upper-kiku.md:44) and for a 'roughly one thread width' shift (craft-sources.md:47), but they are not cited here. 'Exactly one diameter, zero gap' has no source. GT14/R10 adds 1–2 mm of stretch beyond the natural place, and this rule omits it.
- In code: Yes. s8-kiku.ts:52-59: default lowerRowAdvanceMm 3.4, comment «Craft (owner 22.09)». s8-kiku.ts:378-390: lowerPackedAdvanceMm replaces the default with 2r/sin(α/2). Test s8-kiku.test.ts:94 asserts 3.4.

**2. The studio kiku row pitch is exactly 1× thread width: each later flank is the previous flank offset by one diameter, snug and without a gap. The earlier 1.5× is rejected.**

- Where: docs/assumptions.md:26 (also STATE.md:21, spec/kiku-capabilities.md:60 D1); origin dd58047
- Stated basis: Quotes GT14 «about 1 thread width … below previous stitch», but that quote is about the upper stitch, not flank spacing. The rest is «ряды кладут вплотную без зазора, затем прокол», a paraphrase of the owner's 22.09 statement (dd58047 «Owner craft 22.09»; earlier row text «владелец 22.09»). The Toolkit source 'shifted about one thread width' (craft-sources.md:47) is not cited.
- In code: Yes. patterns.ts:481-486: kikuSpec pitch = thread, comment «craft 22.09». patterns.ts:839: parallelOffset(prev flank, spec.pitch) builds every later flank body. The pitch also sets fit/capacity. Tests: kagari.test.ts:351 «(craft pack, owner 22.09)»; pickup-volume.test.ts:52-54 keeps the 5-row contract «not a reason to reopen 1½× (owner 22.09)». tInner = inner + ring·pitch uses the same number but has its own GT14 basis.

**3. Later inner/outer marks are pierced where the snug-packed flank crosses the meridian (pierceOnMeridian), not at a preset outer pitch.**

- Where: docs/assumptions.md:27 (also spec/kiku-capabilities.md:61 D2); origin dd58047
- Stated basis: «craft: укладка вплотную, прокол на пересечении с разметкой». No source; this is the owner's 22.09 statement relabelled. For the lower points, Stretch the points does support 'lay, then pierce where it lands'. For the upper points, craft-questions В1 says the opposite.
- In code: Nominally yes, in effect overridden. patterns.ts:635 pierceOnMeridian is called in kikuFlank (patterns.ts:842-851), but since 44d3926 the result is max(prevOuter + 2 mm GT14 stretch, natural crossing), and the stretch wins on every round. Inner marks no longer use it (7bf0902). The row's 'inner/outer' wording and D2's note «пол 0,85·pitch побеждает» are both out of date.

**4. No corridor is reserved for a future needle exit: the needle 'is brought out where needed, piercing the bundle'.**

- Where: docs/assumptions.md:24 (also comment in src/components/temari/stitches.ts:396-401; HANDOFF.md:362, outside the listed files); origin 20a108c
- Stated basis: No basis given in the row. Commit 20a108c: «Owner: needle pierces the wrap/bundle and can exit anywhere». HANDOFF:362: «Поправка модели (владелец, 22.09)». The code comment says «craft confirmed 22.09» with no source. This contradicts Law 6 (#105: pierce between threads, never into a thread; GT16 'do not split earlier threads').
- In code: Old render path only (?pile=0): the tip-gate and stackClear design in sewKagariLegs (stitches.ts:396-420). The recipe pierce check does the opposite and counts a pierce on a laid thread as a defect.

**5. The staircase at the upper points is not allowed at all. A criterion that growth stops by row 7 is rejected. At the tip, rows must lie side by side (row 2 must not lie on row 1), and legs leave the braid gradually. On this ground the rolling two-ply section prototype is not accepted.**

- Where: spec/pile-render.md:101-104 (same targets in HANDOFF.md:130-133, outside the listed files); origin 83b0c2e, attribution removed in 85c96cd
- Stated basis: Now «Вывод 23.09 (вечер)» plus the tip map, with no source or physics given. It was «Решение владелицы 23.09 (вечер): лесенки быть не должно совсем» (83b0c2e); 85c96cd removed the attribution but added no basis. Craft sources partly contradict it: at the wedge the new thread goes over the whole bundle (craft-questions F6/R2, В3), and the centre is «пухлый» (R9). Some growth at the tip therefore fits the craft; only the 5.6 mm size is suspect.
- In code: Not implemented. It drives acceptance: #103 «Высота у верхних остриёв не растёт от ряда к ряду». It is also why reviews/2026-09-23-pile-section-prototype.patch was not applied. public/design.html:250 still calls the two-ply section model «в работе».

**6. A narrow lift zone with dips between neighbouring crossings was tried and rejected: the thread must not dip between crossings.**

- Where: HANDOFF.md:132 (outside the listed files); origin 17144cf
- Stated basis: 17144cf «The owner's ruling … does not dip between nearby crossings»; HANDOFF «отвергнута владелицей». Physics in docs/assumptions.md:29 (a taut thread bridges about √(2Rh), roughly 2.8 mm) would support 'no dip' only for crossings closer than that, on a rigid ball. That is not stated as the basis.
- In code: Reverted; the patch was not kept in the branch.

**7. Keep the round, incompressible thread section until there is a source for compression parameters.**

- Where: spec/embroidery-model.md:197 (also HANDOFF.md:740)
- Stated basis: «Решение владельца: оставить круглое несжимаемое сечение, пока нет источника параметров». The clause 'no source for parameters' is a valid logical basis on its own; the owner's decision adds nothing. docs/assumptions.md:16 calls it «идеализация».
- In code: Yes. The lab, S8 and upper-kiku solvers use round tubes (spatial-contact.ts, s8-kiku.ts r=0.2, upper-kiku.ts r=0.355). The studio does not: it uses a rigid flattened section, STITCH_FLAT=0.5 (stitches.ts:25), which has no source and is not in assumptions.md. The compression coefficients were rolled back (#93).

**8. The local-envelope variant is rejected: the thread must not follow every bump and press straight back onto the mari. Instead, the whole span between catches has to be solved.**

- Where: spec/needle-route.md:105 (also public/design.html:227-231, docs/next-steps.md:11)
- Stated basis: «владелец справедливо указала на другую крайность: нить огибает каждую неровность … Вариант отклонён», plus the phrase «вместо равновесия целого пролёта». Taut-thread physics (a bridge over an obstacle; next-steps.md:61) supports it but is not cited at this spot. The owner's later remark «нить от шара не отходит» (f8c79aa, now hypothesis #103) points the opposite way.
- In code: Reverted; the variant was never merged.

**9. Acceptance rule 1, variant 1: earlier rounds are taken from their finest accepted level, and the later round's refinement ladder refines only its own windows.**

- Where: spec/s8-control-kiku.md:58 and 275-277 (also HANDOFF.md:701); code 1472a65
- Stated basis: «вариант 1, решение владельца» / «владелец выбрал вариант 1». The text also gives a logical/physical reason: «Физически ранние ряды уже лежат, их точность контролирует их собственная приёмка». Only the attribution needs removing.
- In code: Yes. s8-kiku.ts:190-191 and 593-640 reuse the finest earlier-round construction.

**10. Planned direction: the thread inside the mari follows a straight needle (surface → pierce → buried → pierce → surface) instead of the smooth gaussian 'descend'.**

- Where: docs/assumptions.md:36 (basis given at HANDOFF.md:475, outside the listed files)
- Stated basis: assumptions.md links to HANDOFF for the basis, and HANDOFF:475 says «Владелец: нить следует прямой игле внутри мари». No source is given, although the needle's rigidity could serve as a logical basis.
- In code: Documentation only; not implemented. The steep dive in pile mode (198c5c9) has the agent's own reasoning.

**11. The lift over a crossing is about 0.1 mm per layer, so a braid of rows lying side by side would be about 0.3 mm high.**

- Where: docs/assumptions.md:29 (also issue #103); origin 83b0c2e
- Stated basis: The row is now marked «не обосновано», but the figure of 0.1 mm is the owner's 23.09 estimate («оценка владелицы 23.09: ~0,1 мм», removed in 85c96cd). It still appears in the 'depends on' column and as h in #103, where it is used to compute the 2.8 mm tangent span.
- In code: Not in code. pile-heights.ts lifts by the full section height of 0.355 mm.

**12. The kiku capability matrix is the engineering specification. The D rows (D1 snug ~1× beside not over, D2–D6) are stated as rules without a source column.**

- Where: spec/kiku-capabilities.md:3 and 56-65 (table D)
- Stated basis: «Передано владелицей 23.09.2026 как ТЗ для инженера». The B rows cite sources; the D rows cite none. D1 restates the owner's 22.09 snug rule, and D2's status is out of date.
- In code: Status table only. The rules behind D1 and D2 are the code dependencies listed in the second and third items.

**13. The kiku row pitch is 1× thread width: the new row is laid snug against the previous one with no gap, the 1.5× gap is rejected, and checks that required 1.5× are declared "не авторитетнее укладки".**

- Where: HANDOFF.md:322, HANDOFF.md:455-459, docs/journal.md:185-186, reviews/2026-09-23-kiku-loop-review.md:77 (also docs/next-steps.md:36, spec/s8-control-kiku.md:43)
- Stated basis: HANDOFF:322 "(craft; 1,5× отклонён)"; HANDOFF:455 "(snug, craft 22.09)". journal:185 says "Укладка ряда (владелец 22.09): вплотную по ширине нити". The review says "шаг 1,5× (отклонён владелицей)". The "craft 22.09" in these files is the owner's 22.09 remark.
- In code: Yes. patterns.ts:480-486 kikuSpec `pitch = thread`, with the comment "craft 22.09". It drives the flank body at patterns.ts:839 (parallelOffset by spec.pitch) and tInner at :540. Tests also cite the owner: kagari.test.ts:351 "owner 22.09" and pickup-volume.test.ts:54 "owner 22.09: pack then pierce". A craft basis already exists: craft-questions.md:71 В3 ("рядом, вплотную, не поверх", TemariKai) and GT14 "about 1 thread width … below previous stitch" (patterns.ts:1110). assumptions.md:26 was re-cited to TemariKai in 85c96cd. HANDOFF, journal, the review, the code comment and the tests were not.

**14. The thread keeps a round, incompressible cross-section until a sourced compression model exists. The compression trial (0.18 d, section 0.88, bump 2 d) was reverted.**

- Where: HANDOFF.md:740 (T7), docs/journal.md:119
- Stated basis: "Решение владельца: оставить круглое несжимаемое сечение, пока нет источника параметров". The journal repeats it as "решение владельца — пока оставить круглое несжимаемое сечение".
- In code: The docs keep this decision, but the code contradicts it. The studio uses stitches.ts:23-25 STITCH_FLAT = 0.5, a flattened 0.71 × 0.355 mm section, and STACK_LIFT = 0.42, labelled "studio nestle". pile-heights.ts:30-31 and :122 lift by that 0.355 mm section height. Round tubes are used only in the lab solvers (s8-kiku.ts, spatial-contact.ts, r = 0.2 mm). reviews/2026-09-23-kiku-loop-review.md:55-56 flags the mismatch. docs/assumptions.md:16 and next-steps.md:100 still state round incompressible.

**15. Three things were deferred to #93: waves on the arcs (limiting how steeply the pile rises), thread compression, and pressing the wedge into the mari. The slope-limit envelope was reverted.**

- Where: HANDOFF.md:184-185, docs/night-queue.md:56 (commit 2c026b0)
- Stated basis: HANDOFF: "Волны на дугах владелица отложила вместе со сжатием и вдавливанием клина в мари (#93)". Night queue: "по решению владелицы позже". A visual reason is added: "поздние круги поднимаются «проволокой»".
- In code: Yes, as an absence. pile-heights.ts:42-43, :122 and :142-143 lift each crossing by the full section height with an elliptical profile (vertical walls) and no slope limit. Nothing compresses the thread or sinks it into the mari. HANDOFF:89-91 and spec/pile-render.md blame the 5.62 mm upper-tip staircase on this lift. The lift height is marked "не обосновано" in assumptions.md after 85c96cd.

**16. Inside the mari the thread follows a straight needle (surface → pierce → buried → pierce → surface), not a smooth or Gaussian descend.**

- Where: HANDOFF.md:475-477 (plan at HANDOFF.md:508-515)
- Stated basis: "Владелец: нить следует прямой игле внутри мари … не гладкий/гауссов нырок descend". HANDOFF:490 notes that the sources give no pierce depth.
- In code: Partly. The sewKagariLegs doc comment (stitches.ts:345-349) presents it as "Craft: the thread follows a straight needle through the wrap". The implementation is not a straight chord: a short pierce band, then an elliptical drop to NEEDLE_DEPTH_MM = 1 (stitches.ts:31-35, :386, :413-416). The buried run is not drawn. A physics or logic basis (a rigid straight needle) is available but not cited.

**17. The needle pierces the wrap or bundle and may exit anywhere, so no empty corridor is kept for future ports. Neatness comes from laying threads side by side (tension, combing), incoming-over and passing under the bundle. The goal "leave does not occupy future ports" is declared wrong.**

- Where: HANDOFF.md:362-371
- Stated basis: "Поправка модели (владелец, 22.09): на мари игла протыкает намотку/пучок и может выйти где угодно; отдельный пустой коридор под «будущий порт» не резервируют".
- In code: Old path only. stitches.ts:396-401 repeats it as "craft confirmed 22.09 … Craft does *not* reserve an empty corridor … the needle pierces the wrap where needed". It justifies stackClear/leaveCrest (stitches.ts:410-411), which apply only when !flat, i.e. ?pile=0. The default pile path does not use it. It also contradicts current practice. The loop review (:83-87) and fd05afd treat pierces landing on earlier threads as a craft violation. HANDOFF:107 counts them as a defect (154 of 160 in free mari). The #106 summary in spec/pile-render.md:101-107 lists "прокол между нитями". docs/assumptions.md:25 (tip-gate row) repeats the owner's version.

**18. A later stitch pierces where the snug lay meets the marking line (lay ∩ meridian). In the S8 control the lower-tip row advance is therefore 2r/sin(α/2) ≈ 3.4 mm, "not an equal outer pitch and not a clearance for great-circle legs".**

- Where: docs/journal.md:185-186, HANDOFF.md:456-458 (also spec/s8-control-kiku.md:43-48, docs/next-steps.md:36)
- Stated basis: journal: "Укладка ряда (владелец 22.09): … прокол на пересечении с разметкой". s8-kiku.ts:52 comment: "Craft (owner 22.09)". HANDOFF:456: "Нижний прокол на луче — результат упаковки фланков в V".
- In code: Inactive in the studio. patterns.ts:842-851 computes pierceOnMeridian, but bTheta = max(prevOuter + 2 mm GT14 stretch, natural). Measured on 85c96cd (C240, 10 rounds): the 2 mm stretch wins in every later round. Upper tips use the GT14 one-thread step instead (7bf0902). Active in the lab: s8-kiku.ts:52-59 and :378-390 default lowerRowAdvanceMm = 2r/sin(α/2). This is used by stage row2 (lab S8 row2) and by A2/B2 (s8-kiku-ab2.ts:34-35) in public/fixtures/s8-ab.json, where A2/B2 are rejected.

**19. Target for the upper tip: no staircase at all; rows lie side by side (row 2 not on row 1); legs run straight between hold points and leave the braid gradually, without sharp bends.**

- Where: HANDOFF.md:118-124 (step 1 after 85c96cd; origin commit 83b0c2e)
- Stated basis: The current text gives no source, only "Основание закона — только техника…, решения записываются в эти issues (#106, #107, #101–#105)". Origin (83b0c2e): "Косичка верхнего острия по решению владелицы (23.09, вечер) … ноги не стягиваются в узкий клин" ("The owner … set the target").
- In code: Not implemented; it is the acceptance target for the next step. The code still has the staircase (scripts/pile-stair.mts, HANDOFF:89). The recipe gathers legs into a wedge (patterns.ts:951 gatherUnderBite, :1130), per craft-questions В3/F7 ("woven wedge", TemariKai). The owner's original "не узкий клин" conflicts with that source. "Rows side by side" has a craft basis (craft-questions.md:71). "Straight between holds" fits taut-thread logic. "No staircase at all" and "leave the braid gradually" have no cited basis.

**20. Two candidate models are rejected: a narrow lift zone with dips between crossings, and the rolling two-ply section (reviews/2026-09-23-pile-section-prototype.patch), because it stopped the climb only after row 7.**

- Where: HANDOFF.md:122-124 (origin commits 17144cf, 83b0c2e; spec/pile-render.md:101-102)
- Stated basis: The current text says only "Проверено и не принято". Origins: 17144cf "отвергнута владелицей" (her quote «какие перегибы?»). 83b0c2e: "лесенки быть не должно совсем — критерий «рост прекращается к 7-му ряду» не годится" ("Решение владелицы"). spec/pile-render.md:101 now says "Лесенка не допустима как класс", again with no source.
- In code: Docs only. Neither patch is applied: the narrow-zone patch was not kept, and the two-ply patch sits unapplied in reviews/. The rejection steers which model the next step pursues.

**21. Rule 1, option 1: an earlier round is laid thread, accepted by its own ladder. The later round's ladder refines only its own windows over the finest (x4) earlier construction, so earlier material is a fixed obstacle while a later round is solved.**

- Where: HANDOFF.md:701 (T4б, commit 1472a65); spec/s8-control-kiku.md:58, 275
- Stated basis: "Решение владельца — вариант 1". The spec adds "Физически ранние ряды уже лежат, их точность контролирует их собственная приёмка".
- In code: Yes. s8-kiku.ts:867-878 computeS8Kiku for rows ≥ 2 (lab row2 stage, A2/B2 in s8-ab.json). The same fixed-earlier-thread principle runs through A/B: B is solved against a fixed A (HANDOFF:794). It assumes no joint equilibrium; HANDOFF:688 notes that joint arrive/leave equilibrium is not done.

**22. The workshop renders by sewing order ("позже — выше" pile) by default; ?pile=0 keeps the old count-based lifts.**

- Where: HANDOFF.md:74, HANDOFF.md:175 (docs/night-queue.md:59, commit 2e294d9)
- Stated basis: Mixed. Numbers: "оси 0" and far fewer tube crossings outside the cap. Owner: "острия на 2–4 рядах владелица одобрила" and "(кадры владелицы: «заметно лучше»)". The rule itself cites craft (spec/pile-render.md:3-5, craft-questions).
- In code: Yes. ball.tsx:30-34 PILE_RENDER is on unless pile=0, then createMotifGeometryParts(..., {pile}) at ball.tsx:100. The owner's approval covers exactly the region where the HANDOFF:74 numbers are worse than the old path: cap on 2–4 rows A, 1014 vs 962 and 4182 vs 3842.

**23. A later top stitch's leave rises out of its own port and lies over the arrive. The 22.09 tip-gate that kept stacked leaves buried until past the tip is removed.**

- Where: docs/night-queue.md:47 (commit c540039)
- Stated basis: "7а (по кадру владелицы). Уход из своего прокола" (the frame showed one side surfacing short, under the other).
- In code: Yes, in both render paths: stitches.ts:497-506 (comment at :500) in sewKagariLegs. The code comment also gives a craft reason, the chidori X (the leave rides over the arrive in uwagake chidori, spec/needle-route.md). It should cite that source; the frame is only the observation.

**24. S8 acceptance rule 4 (conditioning): the finest level is rebuilt with 2× constraint probes instead of the old cover/2 check, with the same thresholds. It is acknowledged to be weak and mostly to catch a change of KKT point. Borderline: this is numerical acceptance, not a craft law.**

- Where: HANDOFF.md:583, HANDOFF.md:685 (spec/s8-control-kiku.md:170, 205)
- Stated basis: "(решение за владельцем)" and "правило 4 слабое … (решение владельца)". The substance is the agent's reasoning, with the owner named as arbiter.
- In code: Yes. s8-kiku.ts:151-152, :865 and :877 rebuild the finest level with 2 × probes. This gates the "accepted" status of A1/B1 in public/fixtures/s8-ab.json, which the passport (passport.html, build-passport-model.mts) relies on.

**25. On the S8 control kiku, each later lower stitch moves along the marking ray by the 'packed pierce' 2r/sin(α/2): the new thread lies snug against the previous flanks, and the pierce is where that lay meets the guideline. There is no stretch. The default lowerRowAdvanceMm is 3.4 mm; at run time it is recomputed as 3.388 mm for r=0.2 in the ~13.6° lower V.**

- Where: src/components/temari/s8-kiku.ts:51-59 (constant) and :378-390 (default override); commit dd58047 (22.09). Same rule in docs: docs/assumptions.md:14 (labelled 'craft'), spec/s8-control-kiku.md:43 and docs/next-steps.md:36 (still cite 'владелец')
- Stated basis: "Craft (owner 22.09): lay the next thread snug against the previous flanks (one diameter, no gap), then pierce where that lay meets the guideline". Commit: "Owner craft 22.09". The formula is correct geometry, but its premise, pierce at the natural crossing, rests only on the owner. The sourced rule points the other way: craft-questions R10 cites GT14 "Stretch stitch placement an extra 1-2 mm" past the natural place.
- In code: Yes. planS8Kiku sets d.lowerRowAdvanceMm = lowerPackedAdvanceMm unless the caller overrides it, and rowAlong() uses it for every lower catch with row ≥ 1. So stage 'row2' depends on it: the S8 lab second uwagake round, s8-kiku-ab2 A2/B2 and check-s8-kiku. upper-kiku.ts:27 overrides it to 2 mm (no comment). The studio dropped the same owner-derived lower law in 44d3926 because it stacked the lower points. S8 was never corrected.

**26. The kiku row pitch is exactly 1× the thread width. It used to be 1.5×. Rows lie snug with no gap, then the stitch is pierced.**

- Where: src/components/temari/patterns.ts:481-486 (kikuSpec, pitch = thread); commit dd58047 (22.09). Also docs/assumptions.md:26
- Stated basis: "укладываем вплотную без зазора (TemariKai ≈thread width; craft 22.09)". Per the commit message, 'craft 22.09' means the owner ("Owner craft 22.09: lay the next thread flush"). The source half (TemariKai/GT14 "about 1 thread width … below previous stitch"; craft-questions R1 and В3, rows side by side) was added to the docs later (85c96cd). The code comment still cites the owner.
- In code: Yes, fully. pitch sets the inner step tInner, the parallelOffset of every later flank, firstOuter = outer + pitch, the ceiling, vDepth and the fit/capacity round counts. The rule itself has sources. Only the owner citation in the comment needs replacing.

**27. The outer (lower) pierce of later rounds is where the snug-packed flank crosses the guideline: 'later outer pierces are where the packed flank meets the guideline, not an equal outer pitch'.**

- Where: src/components/temari/patterns.ts:449-453 (kikuSpec JSDoc), :631-656 (pierceOnMeridian), :833-834 and :842-851 (kikuFlank); commit dd58047 (22.09), floor changed in 44d3926 (23.09). Also docs/assumptions.md:27
- Stated basis: "Craft: lay snug, then pierce at that crossing — not at a pre-set equal outer pitch." This was added with the "Owner craft 22.09" commit and cites no other source.
- In code: It is computed but never takes effect. bTheta = min(ceiling, max(prevOuter + stretch, naturalTheta)). I ran kikuFlank for S8 at 85c96cd: every round from 1 to 9 advances exactly by stretch (2 mm, TemariKai/GT14 stretch points), and round 10 clamps at the ceiling. The natural crossing never wins. The JSDoc at 449-453 and the comment at 834 therefore describe a law the output does not follow. The owner-based floor (0.85·pitch) that dd58047 introduced stacked the lower points, and 44d3926 reverted it.

**28. Uwagake upper stitch: lay the thread snug (~1 thread width, no gap), carry it over the earlier rounds, then pierce under the tip bundle 'at the natural guideline crossing'. Craft does not reserve an empty corridor for a future exit, because the needle pierces the wrap where needed.**

- Where: src/components/temari/stitches.ts:396-401 (sewKagariLegs comment block); text from b4ffa91, re-attributed in dd58047 (22.09). Docs: 20a108c
- Stated basis: "TemariKai uwagake (verified 22.09 on toolkit pages; craft confirmed 22.09)". Here 'craft confirmed 22.09' is the owner (dd58047). b4ffa91 calls the no-corridor rule 'TemariKai-verified', but 20a108c grounds it on "Owner: needle pierces the wrap/bundle and can exit anywhere". The 'natural guideline crossing' part has no source; for the upper stitch, R1 puts it one thread below on the line.
- In code: Comment only, over old-path heuristics (lift0, leaveCrest, stackClear). These run only with ?pile=0: in the default pile render, flat=true, so lift0=0 and stackClear=0. No corridor-reservation logic exists, and the old tip-gate was removed in c540039. The default render does not depend on this block.

**29. The perle #5 twist pitch is 3.6 thread diameters (a helix of about 40°). The old value was 1.8.**

- Where: src/components/temari/stitches.ts:992-1007 (PERLE_TWIST_PITCH = 3.6); commit 4c462b5 (17.09)
- Stated basis: Macro photos of DMC perle #5 (43° gives 3.4; band count gives 3.7-3.9) and yarn data (Ne 5 singles, twist-multiplier rules, 4-6 diameters). The comment ends "The first value here was 1.8 — … a hard rope — and the owner said so." That remark is an observation that prompted the re-measurement. It is not the grounds.
- In code: Yes: twistPerUnit and the perle texture. The value is grounded by measurement. Only the owner mention in the comment should be reworded as history, or removed.

**30. On a later upper stitch, the leave comes up out of its own port and lies over the arrive (the chidori X). The 22.09 tip-gate that kept stacked leaves buried was removed.**

- Where: src/components/temari/stitches.ts:500-502 (leave path in sewKagariLegs); commit c540039 (23.09)
- Stated basis: Code comment: the chidori X; craft-questions R2 (Toolkit photos 02/04, GT14: the leaving leg lies over the arriving leg). Commit: "The owner's frame: … one side … surfaced lower, under it". That is an observation of a defect, which is legitimate.
- In code: Yes (outPts lift, pierceRadius). Grounded in craft. The owner appears only as an observation.

**31. Each round the top bite widens by a thread on each side: cornerMm·(2+2·overs), so the braid widens downward as an inverted V.**

- Where: src/components/temari/patterns.ts:1110-1131 (top bite width in compileKiku); c2b7691 (23.09), reverted by fd05afd (23.09)
- Stated basis: The c2b7691 comment and commit: "owner's frame 23.09" plus a per-side reading of GT14.
- In code: Reverted. The current rule is cornerMm·(2+overs), one thread in total per round. Its basis is the GT14 text, the ~26° half-angle of finished GT14 wedges in photos, and the masters' sweep. The per-side version made pierces land on neighbouring points from the 4th round.

**32. By default the workshop lays threads by sewing order: a later thread rests on what is under it, and goes under only in a catch or when underpassing. ?pile=0 shows the old count-based lifts.**

- Where: src/components/temari/ball.tsx:30-34 (PILE_RENDER default); commits b25d014, 2e294d9 (23.09)
- Stated basis: Code: spec/pile-render.md (later-over-earlier; under only inside the catch or when underpassing, per TemariKai and crossing-ledger GT14). Commit b25d014 adds "the braid the owner asked for" as the visual target only.
- In code: Yes, it is the default render. The rule is grounded in craft and logic, not in the owner. The pile height it uses, 0.355 mm = thread width × STITCH_FLAT 0.5, has no source either way; see the next entry.

**33. Target for the upper tip: no staircase at all; rows lie beside each other (row 2 does not lie on row 1); legs are straight between hold points and leave the braid gradually. The 'narrow lift zone with dips' is recorded as 'checked and not accepted'. The ~0.1 mm lift over a crossing, the taut thread with no dips, and the thread never leaving the ball were marked 'не обосновано' in 85c96cd.**

- Where: HANDOFF.md:119-123 (next step 1) and spec/pile-render.md:101-107; origin 83b0c2e, 17144cf, f8c79aa, 0e7fbe4 (23.09), attribution removed in 85c96cd
- Stated basis: Originally "решение владелицы 23.09 (вечер)" and "оценка владелицы ~0,1 мм". 85c96cd removed the attribution, but the target and the rejection are still her ruling, and no source replaced it. The 83b0c2e wording 'legs not squeezed into a narrow wedge' conflicts with the sourced F7/R5 woven wedge.
- In code: Docs only; not implemented. The pile height is 0.355 mm, not 0.1 mm. The code keeps the sourced wedge: gatherUnderBite at patterns.ts:942-951 (F7, 'narrow woven wedge', TemariKai and Russian/Chinese classes). The HANDOFF target and the code's wedge pull in opposite directions.

**34. Keep the thread section round and incompressible until a source gives the compression parameters (#93).**

- Where: spec/embroidery-model.md:197 and HANDOFF.md:740 (17.09; ec642ef). Related code: src/components/temari/stitches.ts:14-25 (STACK_LIFT 0.42, STITCH_FLAT 0.5; 8c2e70a, 20.09)
- Stated basis: "Решение владельца: оставить круглое несжимаемое сечение, пока нет источника параметров". This is a procedural guard against unsourced coefficients. It is not a physical law.
- In code: The docs record it as the owner's decision. S8, taut-contact and spatial-contact use a round section, with the idealisation stated in spec/taut-contact.md §1. The studio contradicts the decision: STITCH_FLAT 0.5 and STACK_LIFT 0.42 (8c2e70a, basis 'a full diameter was the pile at the inner star', with no source and no owner citation) set the flattened section and the pile height. Nothing in code cites the owner here.

**35. S8 numerical acceptance: earlier rounds are taken from their finest accepted construction, and the ladder refines only the current round's windows. Every level is still checked as a complete thread.**

- Where: src/components/temari/s8-kiku.ts:189-191 and :866-869 (rule 1 for later rounds); commit 1472a65 (17.09). Docs: spec/s8-control-kiku.md:58, :275 ('решение владельца', option 1)
- Stated basis: Code: "all earlier rows are laid thread, accepted by [their own ladder]" (logic). Docs: the owner chose option 1 of three; the spec also gives the physical reason ('ранние ряды уже лежат').
- In code: Yes (judge/ladder of stage row2). This is a numerical acceptance rule, not geometry, and the code's own basis is logical. Only the docs credit the owner. The rule 4 replacement ('решение за владельцем', spec/s8-control-kiku.md:170, :205) is in the same position.

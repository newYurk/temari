> Архив предоставленной владелицей записки сторонних агентов, 24.09.2026.
> Это материал для оценки, не принятые правила проекта. Решение по текущему коду:
> [проверка границы расчёта и изображения](../../reviews/2026-09-24-engineering-boundary.md).
> Список ссылок ниже не означает, что каждый источник независимо проверен.

# Инженерная записка: математическая и доменная модель Temari

## Назначение записки

Этот документ собирает обсуждение пяти связанных вопросов: формализация математической модели Temari в коде; разделение геометрии, состояния нити и рендера; сферические геодезические; архитектура физики нитей на искривлённой поверхности; доменная модель ремесленного симулятора.

**Это материал для инженерной оценки, а не утверждённый план работ. Никаких изменений в проекте в рамках обсуждения не выполнялось.** Инженеру предлагается самостоятельно определить, существует ли реальная проблема в текущей реализации, нужна ли корректировка и оправдана ли её стоимость.

Содержимое ветки и актуального кода в рамках этого обсуждения не проверялось непосредственно. Поэтому ниже отдельно разделены уже известные требования проекта, математические факты, возможная целевая архитектура и вопросы, которые необходимо сверять с кодом.

## Исходные требования проекта

Temari задуман как технически убедительный симулятор традиционной вышивки по шару. Математика, геометрия и физика должны быть достаточно строгими, чтобы выдержать инженерное ревью, но степень физической детализации должна соответствовать реальному контексту использования, а не превращаться в самоцель.

Уже зафиксированы следующие продуктовые и предметные принципы:

- Проект организуется вокруг именованных узоров, а не рецептов из книг или внутренних GT-идентификаторов. Книги служат справочниками; пользователь выбирает мотив, например Kiku.
- Каждый узор должен определять собственные булавки, совместимость с obi, порядок стежков и правило остановки Fill.
- C8 допустимо показывать только при наличии честного компилятора, а не как визуальную заглушку.
- Высота вышивки понимается как локальный стек вдоль конкретных стежков и их пересечений, а не как глобальная карта высот поверхности шара. `sewn[]` сам по себе не является высотой; плотность и пересечения должны выводиться из завершённых `KagariOp`, а локальная форма — регулироваться механизмами вроде `stackBump` и `over`.[^1]
- Нити различаются не только цветом и диаметром. Perle-подобный материал рассматривается как плоский лентовидный пучок множества волокон; цилиндрическая нить допустима только как явно обозначенное приближение.

Предметная последовательность также имеет значение: реальная работа начинается с геометрического деления шара, булавок и направляющих, после чего выполняются обмотка, вышивка, закрепления и локальные корректировки. В местах пересечений направляющие могут дополнительно прихватываться, а декоративные ряды строятся относительно уже существующих линий.[^2][^3][^4]

## Единый смысл пяти вопросов

Пять вопросов сводятся к одному архитектурному контракту:

> Ремесленное действие пользователя должно преобразовываться в математически определённое намерение, затем — в рассчитанное состояние материала, и только после этого — в изображение.

Полезно различать четыре уровня утверждений:

1. **Ремесленное намерение:** что сделал пользователь или предписывает узор.
2. **Идеальная геометрия:** где по замыслу должны находиться булавки, направляющие и участки стежка.
3. **Укладка материала:** где фактически проходит нить с учётом толщины, закреплений, соседних нитей и порядка `over/under`.
4. **Визуализация:** как уже рассчитанный результат преобразуется в меш, нормали, UV, LOD и материалы Three.js.

Главный риск смешения этих уровней — ситуация, когда визуальный `offset`, `renderOrder` или настройка depth test начинает исполнять роль физического закона. Обратный риск — чрезмерная физическая модель, которая не улучшает ни ремесленную достоверность, ни изображение, но резко усложняет систему.

## Контракт математической модели

До выбора солвера полезно формально определить, что именно модель обещает вычислять. Рабочая формулировка:

> Для заданной основы, материала и последовательности ремесленных операций модель воспроизводимо вычисляет траектории видимых участков нити, их ширину и профиль, локальные перекрытия и пригодную для рендера геометрию.

Это обещание не включает обязательное моделирование каждого отдельного волокна, точного усилия руки мастера или полной динамики иглы. Такие возможности могут появляться только при отдельной доказанной необходимости.

Минимальные инварианты модели:

- Направление точки поверхности имеет единичную норму.
- Булавка или поверхностная метка действительно принадлежит основе.
- Закреплённые точки сохраняют заданное положение в пределах допуска.
- Длина участка нити не меняется сверх допуска модели.
- Нить не проходит сквозь основу и не объяснённо не проникает через другую нить.
- Порядок `over/under` на пересечениях однозначен.
- Симметрия результата соответствует группе симметрии скомпилированного узора.
- Результат воспроизводим для одинакового набора операций, параметров и версии алгоритма.

Следует различать верификацию и валидацию: верификация отвечает, соответствует ли код заданной математической модели; валидация — насколько сама модель соответствует реальному объекту и назначению. Оценка неопределённости проверяет чувствительность результата к параметрам и допускам.[^5][^6][^7]

## Типы и единицы

Одинаковый `Vector3` не должен неявно означать направление на сфере, мировую координату, вершину меша и экранную точку. Возможный типовой контракт:

```ts
type Vec3 = readonly [number, number, number];

type SphereDirection = Vec3 & {
  readonly __brand: "SphereDirection";
};

interface Ball {
  readonly center: Vec3;
  readonly radiusMm: number;
  readonly foundation: FoundationMaterial;
}

interface SurfaceMark {
  readonly direction: SphereDirection;
  readonly role: "pole" | "pin" | "guidePoint" | "needleEntry";
}

interface ThreadMaterial {
  readonly id: string;
  readonly crossSection: "round" | "flatBundle";
  readonly widthMm: number;
  readonly thicknessMm: number;
  readonly bendCompliance?: number;
}
```

Практичный вариант — хранить положение поверхности как единичный вектор от центра. Сферические координаты можно вычислять для UI, разметки и отладки, но не обязательно использовать как источник истины: в полюсах долгота вырождается, а именно там часто строятся мотивы Kiku.

Единицы должны быть явными. Возможны два совместимых подхода:

- физические величины в миллиметрах;
- нормализованная сфера радиуса 1 внутри чистой геометрии плюс явное преобразование в миллиметры.

Критично не само решение, а запрет на неявное смешение. Также следует разделить допуск нормализации направления, допуск контакта в миллиметрах, критерий сходимости солвера и допуск визуального сравнения. Один универсальный `0.001` для всех задач не имеет физического смысла.

## Ремесленные операции

Последовательность действий полезно хранить как данные, а не только как итоговый меш:

```ts
type CraftOp =
  | { kind: "placePin"; id: string; at: SphereDirection }
  | { kind: "layGuide"; id: string; path: SurfacePath; materialId: string }
  | { kind: "wrap"; id: string; path: SurfacePath; materialId: string }
  | {
      kind: "kagari";
      id: string;
      marks: readonly SphereDirection[];
      materialId: string;
      crossingIntent?: readonly CrossingIntent[];
    }
  | { kind: "secure"; runId: string; at: SphereDirection }
  | {
      kind: "adjust";
      runId: string;
      region: SurfaceRegion;
      action: "nudge" | "tighten";
    };
```

Лог событий естественно соответствует ремеслу и даёт воспроизводимость, undo/redo, диагностику и возможность сравнивать версии алгоритма на одинаковом наборе входных операций. Event sourcing хранит изменения последовательно и позволяет восстанавливать состояние повторным проигрыванием событий.[^8]

При этом полезно различать:

- **авторитетные данные:** завершённые `CraftOp`/`KagariOp`, идентичности нитей, материалы, закрепления, намеренный порядок пересечений;
- **вычисляемое состояние:** семплы траектории, локальная высота, рамки сечения, контакты, меши и acceleration structures;
- **версию вычисления:** версия компилятора узора, укладчика или солвера, с которой был получен кэш.

## Разделение слоёв

Рекомендуемая концептуальная цепочка:

```text
Craft operations / Pattern compiler
                ↓
Ideal spherical geometry
                ↓
Thread placement and contact state
                ↓
Optional relaxation / physics solver
                ↓
Render geometry
                ↓
Three.js and UI
```

Это не требование немедленно создать отдельный пакет на каждый блок. Граница важнее физического расположения файлов.

| Слой | Отвечает на вопрос | Не должен делать |
|---|---|---|
| Домен и операции | Что сделал пользователь и допустимо ли действие? | Создавать Three.js-меши или анализировать пиксели |
| Компилятор узора | Какие булавки, направляющие и операции порождает мотив? | Подменять неизвестные правила заглушками |
| Сферическая геометрия | Где по замыслу проходит поверхностная кривая? | Читать камеру, материалы и `renderOrder` |
| Состояние нити и контакт | Где лежит конкретная нить и что находится сверху? | Определять цвет блика или LOD |
| Солвер | Как удовлетворить ограничения длины, изгиба, закреплений и контакта? | Менять предметный порядок операций |
| Рендер | Как показать рассчитанный результат? | Назначать физическую высоту визуальным offset |
| UI | Какие действия доступны и почему? | Вычислять доменные факты по экранному изображению |

Полезный критерий: если отключить рендер, доменная модель всё ещё должна уметь ответить, какие нити существуют, по каким путям они уложены, где находятся контакты и каков порядок перекрытий.

## Состояние нити

Предлагаемая форма вычисленного состояния вдоль одной нити:

```ts
interface PlacedRun {
  readonly sourceRunId: string;
  readonly samples: readonly {
    direction: SphereDirection;
    heightMm: number;
    widthMm: number;
    frame: LocalFrame;
  }[];
  readonly contacts: readonly {
    otherRunId: string;
    atArcLengthMm: number;
    relation: "over" | "under" | "beside";
    clearanceMm: number;
  }[];
}
```

`heightMm` здесь принадлежит конкретной нити и конкретной координате вдоль неё. Это не глобальная функция высоты шара. На пересечении важны обе идентичности нитей, порядок укладки, форма сечения, возможное сжатие, локальный выгиб и ремесленное намерение. Глобальный heightmap теряет эту историю и не подходит как источник истины для `over/under`.[^1]

Для плоского пучка ширина и толщина независимы; ориентация сечения вдоль пути влияет и на контакт, и на видимую геометрию. Явная модель отдельных волокон не обязательна: исследования yarn-level rendering и simulation показывают, что нити можно представлять гибкими кривыми с ограничениями и контактами, отделяя центральную линию от более мелкой структуры материала.[^9][^10]

## Геометрия сферы

Для шара с центром `C`, радиусом `R` и единичным направлением `u`:

\[
p = C + Ru, \qquad \lVert u \rVert = 1.
\]

Угловое расстояние между направлениями `u` и `v` устойчиво вычисляется как:

\[
\theta = \operatorname{atan2}(\lVert u \times v \rVert, u \cdot v),
\qquad d = R\theta.
\]

Кратчайший путь между двумя различными неантиподальными точками идеальной сферы проходит по меньшей дуге большой окружности.[^11][^12][^13]

Для семплирования такой дуги подходит SLERP:

\[
\gamma(t)=
\frac{\sin((1-t)\theta)}{\sin\theta}u+
\frac{\sin(t\theta)}{\sin\theta}v,
\qquad 0 \le t \le 1.
\]

SLERP сохраняет единичную норму и даёт постоянную угловую скорость вдоль большой окружности.[^14][^15][^16]

Необходимы явные крайние случаи:

- при почти совпадающих направлениях — линейная интерполяция с последующей нормализацией;
- при почти антиподальных направлениях — путь не единственен, поэтому плоскость дуги должна определяться дополнительной точкой, направляющей, ориентацией узора или явным правилом;
- при точном совпадении — нулевая дуга или отдельная доменная ошибка в зависимости от операции.[^17][^14]

Пересечение двух больших окружностей можно найти через нормали их плоскостей. Если `nA` и `nB` — полюса окружностей, кандидаты равны `±normalize(nA × nB)`, после чего необходимо проверить принадлежность обоим конечным дуговым отрезкам. Почти нулевое векторное произведение означает совпадающие или плохо обусловленные окружности.[^18]

## Геодезическая не универсальна

Ключевое ограничение: не вся видимая нить обязана быть геодезической.

Геодезическая корректна как эталон свободного участка на гладкой сфере между двумя закреплениями. Но направляющая, ряд Kiku, obi, нить с несколькими закреплениями, участок, удерживаемый соседними рядами, и сознательно смещаемая дорожка могут быть малыми окружностями или произвольными управляемыми путями. Реальное ремесло задаёт движение относительно булавок и существующих направляющих, включая проходы под линиями и прихватки.[^4][^2]

Поэтому тип пути должен объяснять его происхождение:

```ts
type SurfacePath =
  | {
      kind: "greatCircleArc";
      from: SphereDirection;
      to: SphereDirection;
      via?: SphereDirection;
    }
  | {
      kind: "smallCircle";
      axis: SphereDirection;
      angularRadiusRad: number;
      fromRad: number;
      toRad: number;
    }
  | {
      kind: "guided";
      controlPoints: readonly SphereDirection[];
    }
  | {
      kind: "patternPath";
      patternId: string;
      elementId: string;
    };
```

Если `guided`-путь сглаживается в 3D, следует явно выбрать интерполятор и правило проекции на поверхность. Для нерегулярных контрольных точек центростремительная параметризация Catmull–Rom уменьшает риск петель и изломов; в соответствующем семействе именно она гарантирует отсутствие внутренних cusp и self-intersection в сегменте.[^19][^20][^21]

Для ориентации плоского сечения вдоль кривой предпочтительна rotation-minimizing/Bishop frame или дискретный параллельный перенос, а не Frenet frame, который нестабилен при малой кривизне и добавляет лишнее кручение. Discrete Elastic Rods формализует центральную линию, адаптированную материальную рамку, параллельный перенос, изгиб и кручение.[^22][^23][^24]

## Физика и релаксация

Слово «физика» имеет смысл использовать только там, где действительно решаются ограничения или уравнения материала. Возможна поэтапная модель.

### Квазистатическая укладка

После ремесленного действия вычисляется устойчивое состояние без обязательной анимации полёта нити:

- закрепления остаются на месте;
- длина сохраняется в пределах допуска;
- нить не проходит сквозь основу;
- соблюдается заданный порядок пересечений;
- учитываются толщина и ширина сечения;
- релаксируется только новый участок и локальные соседи.

Это уже механическая модель, даже если система не моделирует инерцию иглы и движение руки.

### PBD и XPBD

Position Based Dynamics работает непосредственно с позициями: выполняется прогноз положения, затем итерационная проекция ограничений, после чего скорости пересчитываются из перемещения. Подход хорошо подходит для интерактивных контактов и ограничений.[^25][^26][^27]

Возможные ограничения:

- длина сегмента;
- изгиб между соседними сегментами;
- закрепление на булавке или в точке входа;
- непроникновение в основу;
- контакт нить–нить;
- предписанный `over/under`;
- ориентация плоского сечения;
- трение и допустимое скольжение.

Обычный PBD может менять эффективную жёсткость при изменении временного шага и числа итераций. XPBD вводит compliance и накопленный множитель Лагранжа, делая настройку податливости менее зависимой от этих параметров.[^28][^29][^30]

### Discrete Elastic Rods

Полная модель дискретного упругого стержня оправдана, если продукту действительно нужны физически содержательные кручение, материальная рамка, анизотропное сечение, сложные узлы или сильная динамическая деформация. DER рассматривает изгиб центральной линии отдельно от вращения материальной рамки вокруг касательной.[^31][^24][^22]

Для текущего контекста это возможный верхний уровень детализации, но не автоматически обязательный выбор.

### Контакт

Формула вида `|x - C| = R + h` допустима как локальное ограничение, но значение `h` на пересечении не должно назначаться произвольным номером слоя до расчёта контакта. Оно должно следовать из геометрии нижней нити, порядка укладки, профиля сечения и допустимого сжатия.

Контакт нельзя проверять только в редких вершинах полилинии: отрезок между безопасными вершинами способен пройти сквозь соседнюю нить. Необходимы либо адаптивная дискретизация по кривизне и близости, либо segment/segment и ribbon/ribbon проверки.

Для нитей особенно перспективны persistent contacts: контакт между соседними нитями часто долгоживущий и допускает ограниченное скольжение. Исследования yarn-level cloth используют устойчивые скользящие контакты и компактное представление пересечений, петель, стежков и стеков вместо полного повторного поиска всех коллизий.[^32][^10]

Гравитацию и эффект «нить съезжает к экватору» нельзя вводить как декоративное правило. Такое движение зависит от закреплений, трения, натяжения и контакта; без постановки задачи оно будет выглядеть физическим, но не иметь физического основания.

## Доменная модель

DDD-разделение можно применить следующим образом.

### Сущности

Объекты с идентичностью и жизненным циклом:

- `Mari`;
- `ThreadRun`;
- `PatternInstance`;
- `Anchor`;
- `Pin`;
- `Guide`;
- `Layer` или `Placement`;
- завершённый `KagariOp`.

### Объекты-значения

Не имеют самостоятельной идентичности и определяются значением:

- `SphereDirection`;
- `SpherePoint`;
- `GreatCircle`;
- `SphericalArc`;
- `SurfacePath`;
- `MaterialSpec`;
- `ThreadProfile`;
- `Tension`;
- `Compliance`;
- `SymmetryGroupRef`;
- `CrossingIntent`.

### Агрегат

`Mari` может быть aggregate root, через который проводятся операции, изменяющие ремесленное состояние. Агрегат отвечает за инварианты: ссылка только на существующую булавку, допустимый материал, корректный порядок операций, наличие необходимых направляющих, непротиворечивый `over/under` и совместимость мотива с делением шара.

В DDD сущность различается по идентичности, value object — по значению, а aggregate root задаёт границу согласованности и единую точку изменения внутренних объектов.[^33][^34][^35]

Не обязательно помещать тяжёлый массив частиц, spatial hash и GPU-буферы внутрь агрегата. Они могут быть вычисляемыми проекциями или кэшем инфраструктурного слоя, пересоздаваемым из доменных операций.

## Узоры как компиляторы

Узор не должен храниться только как готовый набор мировых координат. Более честная модель:

```ts
interface PatternDefinition {
  readonly id: string;
  readonly requiredDivision: "S4" | "S8" | "C6" | "C8" | "C10";
  readonly additionalPins: readonly PinRule[];
  readonly stitchProgram: readonly StitchInstruction[];
  readonly fillRule: FillRule;
}

function compilePattern(
  pattern: PatternDefinition,
  context: MariContext
): PatternInstance;
```

Компилятор обязан породить:

- деление сферы;
- булавки и направляющие;
- последовательность ремесленных операций;
- симметричные повторения;
- правило остановки Fill;
- объяснимую ошибку, если условия не выполнены.

Комбинированные деления C6, C8 и C10 имеют конкретную сферическую конструкцию. Для C8 используется равное деление восемью долготами и параметр `R8 = 1/8`; соответствующее деление связано с 48 сферическими треугольниками и определёнными осями вращения.[^36]

Следовательно, C8 следует считать реализованным только тогда, когда компилятор воспроизводит это деление и корректно размещает зависимые элементы мотива. Это соответствует ранее зафиксированному продуктовому принципу.

## Возможные исполняемые проверки

Наличие следующих предикатов делает архитектурные заявления проверяемыми:

```ts
isUnitDirection(dir)
isOnBall(mark, ball)
pathEndpointsMatch(path, anchors)
arcLengthWithinTolerance(run)
anchorsRemainFixed(run)
layerOrderIsConsistent(model)
contactsRespectCrossingIntent(model)
noUnexplainedSelfIntersection(run)
noFoundationPenetration(run, ball)
isSymmetric(patternInstance, symmetryGroup)
coverageOfRegion(patternInstance, region)
renderProjectionDoesNotMutateDomain(model)
replayIsDeterministic(eventLog, solverVersion)
```

Полезные эталонные сцены:

- пустая основа;
- одна большая окружность;
- малая окружность/obi;
- две нити с `A over B`;
- те же нити с `B over A`;
- почти совпадающие точки;
- почти антиподальные точки с явным `via`;
- плоский пучок поверх круглой нити;
- плотный ряд Kiku у полюса;
- повтор одной истории операций двумя версиями солвера.

## Наблюдаемость

Для инженерной диагностики полезно иметь отдельный debug-режим, не смешанный с художественным рендером:

- направления и локальные рамки;
- точки семплирования и адаптивную плотность;
- кривизну пути;
- закрепления;
- контактные пары;
- `over/under`;
- локальную высоту и clearance;
- невязки ограничений;
- условное натяжение или множители ограничений;
- границы пространственного индекса.

Так математическое утверждение можно проверить непосредственно, а не заключать о нём только по финальному изображению.

## Варианты инженерного решения

Ниже не план изменений, а рамка для оценки текущего кода.

| Вариант | Когда оправдан | Основной риск |
|---|---|---|
| Ничего не менять | Текущие типы, операции и тесты уже обеспечивают нужные инварианты; видимые проблемы отсутствуют | Скрытая связанность может остаться недокументированной |
| Только документировать | Архитектура фактически правильная, но контракт и границы неочевидны | Документ может разойтись с кодом без исполняемых тестов |
| Добавить тесты без перестройки | Реализация работает, но крайние случаи и воспроизводимость не защищены | Тесты могут зафиксировать случайное поведение |
| Локально уточнить границы | Рендер или UI иногда принимает доменные решения | Частичная миграция создаст временное дублирование |
| Добавить квазистатическую релаксацию | Геометрической укладки недостаточно для плотных контактов | Новая сложность без видимого продуктового эффекта |
| Ввести XPBD/DER | Требуются измеримые деформации, compliance, кручение или динамика | Высокая стоимость и риск переусложнения |

## Вопросы инженеру

Перед решением о каких-либо действиях имеет смысл проверить код по следующим пунктам:

1. Что является источником истины: операции, итоговые пути, массив `sewn[]` или рендер-меши?
2. Сохраняется ли идентичность каждой нити и порядок пересечений после компиляции и рендера?
3. Является ли текущая высота локальным свойством нити, или где-то фактически используется глобальная карта/общий offset?
4. Может ли рендер изменить доменное состояние либо компенсировать отсутствие контакта через `renderOrder`, depth bias или произвольный радиальный offset?
5. Как различаются great-circle, small-circle и guided-пути?
6. Что происходит при совпадающих и антиподальных точках?
7. Есть ли единый тип единиц и отдельные классы допусков?
8. Проверяются ли контакты между сегментами, а не только между вершинами?
9. Является ли `over/under` входным намерением, вычисленным контактом или случайным следствием порядка построения?
10. Можно ли воспроизвести состояние по завершённым `KagariOp`?
11. Версионируется ли вычисляемый кэш относительно версии компилятора/солвера?
12. Представлен ли Perle как анизотропное сечение или только цилиндр?
13. Компилируются ли Kiku, C8 и Fill из предметных правил или задаются готовыми координатами/слайдерами?
14. Существуют ли тесты симметрии, контактного порядка и повторного проигрывания?
15. Решает ли текущая «физика» реальную продуктовую проблему или только усложняет траекторию?

## Итоговая позиция

Самая консервативная и согласованная модель Temari выглядит так:

- источник истины — последовательность ремесленных операций и предметные идентичности;
- узор — компилятор операций, а не набор рендерных точек;
- чистая сферическая геометрия отвечает только за идеальные пути;
- состояние нити хранит локальные контакты, профиль и порядок `over/under`;
- высота остаётся локальной вдоль нити, без глобального heightmap;
- физический солвер является опциональным уровнем уточнения, начиная с квазистатической релаксации;
- рендер представляет результат и не определяет предметную физику;
- сложность XPBD или DER вводится только при наличии проверяемой необходимости.

Эта позиция совместима с уже зафиксированными принципами проекта, но сама по себе не доказывает необходимость рефакторинга. Окончательное решение требует сопоставить перечисленные контракты и инварианты с актуальным кодом, тестами и наблюдаемыми дефектами. До такой проверки корректный статус — **никаких изменений не выполнять**.

---

## References

1. [Проверю, как высота реально считается в рендере — не по схеме из текста, а по коду.Текст врёт про текущий код. Высота уже есть — не как карта на сфере, а как локальный стек на стежке. Глобальный heightmap как раз сломает то, что мы уже чинили.
Как се...

...ересечения готовых KagariOp, не дискретизировать сферу.
Кику сейчас врёт не потому, что нет heightmap. Врёт путь бока и плотность. Высота у полюса уже локальная; если на кадре лепесток плоский или наоборот взлетел — чинить stackBump / over, не сетку.](https://www.perplexity.ai/search/a4cd7b7c-5357-414a-befa-7a514308d632) - Этот разбор попадает точно в суть математики текстильной симуляции. Предыдущее предположение о скаля...

2. [How to Make Temari : 9 Steps (with Pictures) - Instructables](https://www.instructables.com/How-to-Make-Temari/) - Step 4: Mark With Pins. Cut a long piece of thread. Attach a piece of thread. Wrap a line of this th...

3. [[PDF] Temari 5 Pointed Star Pattern](https://ealdormere.ca/barony-of-rising-waters/wp-content/uploads/sites/24/2020/04/Temari-5-pointed-star-Class-handout.pdf) - The tools required to do this are long sharp needles (I like a 2 ½” long needle), embroidery scissor...

4. [Feature Friday- Japanese Temari! - Suzy's Artsy Craftsy Sitcom](https://suzyssitcom.com/2011/05/feature-friday-japanese-temari.html) - But for basic instructions, you simply anchor your thread the same as you did for the guidelines, st...

5. [Verification, Validation and Uncertainty Quantification (VVUQ) - ASME](https://www.asme.org/codes-standards/publications-information/verification-validation-uncertainty) - Uncertainty quantification is conducted to determine how variations in the numerical and physical pa...

6. [VVUQ Standards: Verification & Validation Resource Hub - ASME](https://www.asme.org/codes-standards/vvuq-standards) - VVUQ 10.2 - The Role of Uncertainty Quantification in Verification and Validation of Computational S...

7. [Standardizing Computational Models: Verification, Validation and ...](https://www.machinedesign.com/automation-iiot/article/21270513/standardizing-computational-models-verification-validation-and-uncertainty-quantification) - verification, validation and uncertainty quantification (VVUQ) to ensure that the results from simul...

8. [Event Sourcing Pattern - GeeksforGeeks](https://www.geeksforgeeks.org/system-design/event-sourcing-pattern/) - Event Sourcing records every change as an event instead of just storing the current state, creating ...

9. [Yarn-based Cloth Simulation - Cornell University](https://www.cs.cornell.edu/projects/YarnCloth/) - Yarn-Based Cloth Jonathan M. Kaldor Thesis, Cornell. This thesis presents a yarn-based model for clo...

10. [Yarn-Level Cloth Simulation with Sliding Persistent Contacts](https://www.computer.org/csdl/journal/tg/2017/02/07516643/13rRUxlgy3N) - We introduce a compact representation of yarn geometry and kinematics, capturing the essential defor...

11. [Great-circle distance - Wikipedia](https://en.wikipedia.org/wiki/Great-circle_distance) - This arc is the shortest path between the two points on the surface of the sphere. (By comparison, t...

12. [Shortest Path between Two Points on a Sphere](https://demonstrations.wolfram.com/ShortestPathBetweenTwoPointsOnASphere/) - The two points separate the great circle into two arcs and the length of the shorter arc is the shor...

13. [Great circle - Wikipedia](https://en.wikipedia.org/wiki/Great_circle) - a great circle or orthodrome is the circular intersection of a sphere and a diametral plane, which i...

14. [SLERP: Spherical Linear Interpolation - Emergent Mind](https://www.emergentmind.com/topics/spherical-linear-interpolation-slerp-468c686a-5b2d-4aab-97e1-390017ada09d) - SLERP is a method for interpolating points on a unit sphere along great circles, ensuring constant a...

15. [Spherical linear interpolation - Wikipedia](https://en.wikipedia.org/wiki/Spherical_linear_interpolation) - When the interpolation parameter represents time, spherical linear interpolation results in a consta...

16. [[PDF] SAN FRANCISCO JULY 22-26 Volume 19, Number 3, 1985](https://www.cs.cmu.edu/~kiranb/animation/p245-shoemake.pdf) - Spherical interpolation itself can be used for purposes besides animating rotations. For example, th...

17. [Document](https://pydocs.github.io/p/scipy/1.8.0/api/scipy.spatial._geometric_slerp.geometric_slerp.html) - The interpolation occurs along a unit-radius great circle arc in arbitrary dimensional space. ... Ge...

18. [Spherical vector geometry - Via Technology](https://via-technology.aero/navigation/spherical-vector-geometry/) - A great circle on the surface of a sphere can be viewed as the circular intersection of a sphere and...

19. [Centripetal Catmull–Rom spline - Wikipedia](https://en.wikipedia.org/wiki/Centripetal_Catmull%E2%80%93Rom_spline) - the centripetal Catmull–Rom spline is a variant form of the Catmull–Rom spline, originally formulate...

20. [[PDF] Parameterization and Applications of Catmull-Rom Curves](https://people.engr.tamu.edu/schaefer/research/cr_cad.pdf) - While centripetal and chordal parameterizations have similar bounds to the infinite line segments, t...

21. [Properties of Catmull–Rom Splines](https://splines.readthedocs.io/en/latest/euclidean/catmull-rom-properties.html) - Centripetal parameterization has the very nice property that it guarantees no cusps and no self-inte...

22. [[PDF] Discrete Elastic Rods | Columbia CS](https://www.cs.columbia.edu/cg/pdfs/143-rods.pdf) - We present a discrete treatment of adapted framed curves, paral- lel transport, and holonomy, thus e...

23. [Discrete Elastic Rods](https://www.cs.columbia.edu/cg/rods/) - Abstract. We present a discrete treatment of adapted framed curves, parallel transport, and holonomy...

24. [[PDF] Geometric aspects of discrete elastic rods Max Wardetzky](https://ddg.math.uni-goettingen.de/pub/Rods_Oberwolfach) - The assignment of an adapted frame to one point on the curve uniquely pins down the. Bishop frame th...

25. [[PDF] Position Based Dynamics - GitHub Pages](https://matthias-research.github.io/pages/publications/posBasedDyn.pdf) - collision constraints can be handled easily and. Friction and restitution can be handled by manipula...

26. [Position Based Dynamics | PBD | Carmen's Graphics Blog](https://carmencincotti.com/2022-07-11/position-based-dynamics/) - Onward to the beauty of position-based dynamics. The iterative solver manipulates the position of th...

27. [Position Based Dynamics (PBD) - imstk-documentation](https://imstk.gitlab.io/Dynamical_Models/PbdModel.html) - Position based dynamics [pbd] is a first order, particle & constraint based dynamical model. It simu...

28. [XPBD: position-based simulation of compliant constrained dynamics](https://dl.acm.org/doi/10.1145/2994258.2994272) - The Extended Position Based Dynamics (XPBD) approach of Macklin et al. [2016] addresses the issues w...

29. [[PDF] XPBD: Position-Based Simulation of Compliant Constrained Dynamics](http://mmacklin.com/xpbd.pdf) - We address the long-standing problem of iteration count and time step dependent constraint stiffness...

30. [[PDF] Comparing soft body simulations using extended position-based ...](https://www.diva-portal.org/smash/get/diva2:1708156/FULLTEXT01.pdf) - For instance, in 2016 Macklin et al. introduced extended position-based dynamics (XPBD)[9], which es...

31. [Discrete elastic rods | ACM SIGGRAPH 2008 papers](https://dl.acm.org/doi/10.1145/1399504.1360662) - Miklós Bergou, We present a discrete treatment of adapted framed curves, parallel transport, and hol...

32. [Yarn-Level Cloth Simulation with Sliding Persistent Contacts](https://dl.acm.org/doi/10.1109/TVCG.2016.2592908) - We propose instead an efficient representation of cloth at the yarn level that treats yarn-yarn cont...

33. [When do you use entities, value objects and aggregates (DDD)?](https://stackoverflow.com/questions/77425208/when-do-you-use-entities-value-objects-and-aggregates-ddd) - Entity versus Value object. In DDD, you model your business cases using domain objects. These object...

34. [What Is an Aggregate Root? | Baeldung on Computer Science](https://www.baeldung.com/cs/aggregate-root-ddd) - Before discussing Aggregates, we'll first discuss two domain objects used within an Aggregate, namel...

35. [DDD Modelling - Aggregates vs Entities: A Practical Guide](https://www.dandoescode.com/blog/ddd-modelling-aggregates-vs-entities) - When applying Domain-Driven Design (DDD), one of the trickiest decisions you'll make is distinguishi...

36. [Temari Balls, Spheres, SphereHarmonic: From Japanese Folkcraft ...](https://www.mdpi.com/1999-4893/15/8/286) - S8 is the division of the spherical surface by sixteen isosceles triangles of which interior angles ...

# Темари

Нить на сфере.

[Состояние проекта и план кику](STATE.md) — текущая точка входа для разработки.

**Играть:** https://newyurk.github.io/temari/

**Схема нити:** https://newyurk.github.io/temari/design.html  
Короткий адрес `/design/` перенаправляет на эту же страницу. Источник — `public/design.html`.

**Образец C8:** https://newyurk.github.io/temari/lab.html — метки и порядок обхода, ещё без физической нити и полного рецепта GT55.

Исходники — в `src/`, вход игры — `index.html` → `src/pages.tsx`. GitHub Pages собирается Actions из `main`: тесты → проверка типов → сборка → публикация `dist/`. Результат сборки не хранится в Git. Старые `docs/assets`, `assets` и `dist-pages` оставлены как исторические копии и больше не служат источником публикации.

Для разработки нужен Node 24: `npm ci`, затем `npm run dev`. Проверки: `npm test`, `npm run typecheck`, `npm run build`. Два адреса закреплены, чтобы параллельные проекты не перехватывали их друг у друга: dev-сервер — `npm run dev` на 8860, просмотр собранной версии — `npm run preview` на 4174. Браузерные проверки идут против собранной: `node scripts/check-pages.mjs http://127.0.0.1:4174/`. Снимок опубликованных исходников — `/build.json`.

**Карта ремесла.** `Temari-Obsidian/` — хранилище Obsidian, собранное из каталога игры (`src/components/temari/library.ts`): узоры, разметки, стежки, нити, размеры шара и то, что из них достижимо в мастерской. Руками не правится: `npx tsx scripts/build-craft-vault.mts --write`, CI проверяет `--check`. Картинка без Obsidian — `--picture`. На чём стоят наши числа — [docs/assumptions.md](docs/assumptions.md).

Модель разработки: [архитектура и математика](spec/embroidery-model.md), [ремесленные источники](spec/craft-sources.md), [контракты проверки](src/components/temari/rules.md). Поддержка рецепта, его реализация и ремесленная приёмка отмечаются раздельно.

После правки страницы: `node scripts/sync-design.mjs --write`, затем `node scripts/sync-design.mjs --check`. CI проверяет совпадение документа и зеркал; для изменения содержания также нужна визуальная проверка. Правила поддержания документов — в [AGENTS.md](AGENTS.md).

[Обзор достоверности ремесла и симуляции](reviews/craft-simulation-review-2026-09-15.md) — инженерная проверка `0a49f87` от 15 сентября 2026 года и визуальный проход сборки `1365daa`; дополнено 16 сентября. Версии, наблюдения и ограничения указаны в обзоре.

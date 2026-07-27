# README Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans to implement this plan task-by-task.

**Goal:** Add badges, mermaid diagram, detailed features, and dev section to existing README.md without breaking existing content.

**Architecture:** Single-file change. All additions are additive — no content removed, only expanded/reformatted. Each task is independent.

**Tech Stack:** Markdown, Mermaid (GitHub-native), shields.io badges

**Global Constraints:**
- Only README.md is modified — no new files, no code changes
- All existing content must remain intact (ordering, links, sections)
- Russian language (follow existing README style)
- Badges must use https://img.shields.io/ static shields
- Mermaid diagram must use `sequenceDiagram` syntax (GitHub-compatible)
- No screenshots

---

### Task 1: Add badges to header

**Files:**
- Modify: `README.md:1-19`

**Interfaces:**
- Consumes: Existing README.md header (logo + title + description)
- Produces: README.md header with badge row added after description

- [ ] **Step 1: Read current header area to confirm exact text**

```bash
Get-Content README.md -Head 20
```

- [ ] **Step 2: Insert badge block after the `</p>` closing the description paragraph, before the nav links**

Insert this block between line 10 and line 12 (after `</p>` description, before `<p align="center">` with nav links):

```markdown
<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20.x-339933?logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/grammY-1.35-2BA3E6?logo=telegram&logoColor=white" alt="grammY">
  <img src="https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT">
</p>

```

- [ ] **Step 3: Verify the edit**

Run: `Get-Content README.md -Head 25`
Expected: Logo → title → description → badges → nav links — all present, original content intact.

- [ ] **Step 4: Commit**

```bash
git add README.md && git commit -m "docs: add badges to README header"
```

---

### Task 2: Replace plain list with mermaid sequence diagram

**Files:**
- Modify: `README.md:31-38` (section "Как это работает")

**Interfaces:**
- Consumes: Existing numbered list in "Как это работает"
- Produces: Same section with mermaid sequenceDiagram, keeping descriptive text

- [ ] **Step 1: Read current section**

- [ ] **Step 2: Replace the numbered list with mermaid block**

Replace lines 33-38 (the numbered list):

```markdown
\`\`\`mermaid
sequenceDiagram
    actor User
    participant Bot
    participant StaffGroup as Группа персонала

    User->>Bot: Сообщение в ЛС
    Bot->>StaffGroup: Создаёт тему форума с именем пользователя
    Bot->>StaffGroup: Пересылает сообщение в тему
    StaffGroup->>Bot: Ответ оператора в теме
    Bot->>User: Копирует ответ в ЛС (без пометки «переслано»)
    Note over User,StaffGroup: Последующие сообщения — в ту же тему
\`\`\`
```

- [ ] **Step 3: Verify the edit**

Check: Section still has intro text, mermaid block is properly fenced, description below is intact.

- [ ] **Step 4: Commit**

```bash
git add README.md && git commit -m "docs: replace list with mermaid sequence diagram"
```

---

### Task 3: Expand features section

**Files:**
- Modify: `README.md:23-29`

**Interfaces:**
- Consumes: Existing bullet list in "Возможности"
- Produces: Expanded "Возможности" with detailed sub-sections

- [ ] **Step 1: Read current features section**

- [ ] **Step 2: Replace the simple bullet list**

Replace lines 24-29 (the feature list):

```markdown
## Возможности

### 🛡️ Защита от спама
Автоматическое ограничение: не более 10 сообщений за 20 секунд. При превышении — пользователь заサイレンス (mute) на 60 секунд с уведомлением.

### 🧹 Авто-очистка неактивных чатов
Если в тикете нет активности 7 дней, оператор получает предупреждение с кнопкой «Очистить чат». После подтверждения тема закрывается, пользователь получает уведомление о конфиденциальности.

### 🔒 Privacy cleanup
При пересоздании темы (например, если старая удалена) пользователь получает прозрачное уведомление: «Предыдущий чат очищен по соображениям безопасности и конфиденциальности».

### 🆔 Команда /myid
Пользователь может запросить свой Telegram ID командой `/myid` в личном чате с ботом.

### ⚡ Технические особенности
- **Одна зависимость** — [grammY](https://grammy.dev)
- **Режим polling** — не нужен вебхук или HTTP-сервер
- **Хранение в JSON-файле** — не требуется база данных
- **Автоматическое переоткрытие** закрытых тем при новых сообщениях от пользователя
```

- [ ] **Step 3: Verify**

Check: Все существующие фичи сохранены, новые детали добавлены. Разметка корректна.

- [ ] **Step 4: Commit**

```bash
git add README.md && git commit -m "docs: expand features section with details"
```

---

### Task 4: Add development section

**Files:**
- Modify: `README.md` after line 94 (after "Данные сохраняются..." paragraph, before "Полезные команды" table)

**Interfaces:**
- Consumes: Existing installation section
- Produces: New "Разработка" section inserted

- [ ] **Step 1: Read area around line 95**

- [ ] **Step 2: Insert "Разработка" section**

Insert this block before "### Полезные команды":

```markdown
## Разработка

### Локальный запуск

```bash
# Установка зависимостей
npm install

# Запуск в dev-режиме (автоперезагрузка при изменениях)
npm run dev
```

### Сборка и продакшн

```bash
# Компиляция TypeScript → JavaScript
npm run build

# Запуск скомпилированной версии
npm start
```

### Тестирование

```bash
npm test
```

Тесты используют встроенный test runner Node.js (`node --test`) — не требуется дополнительный фреймворк.

### Структура проекта

```
src/
  index.ts      — Точка входа: polling + graceful shutdown
  config.ts     — Переменные окружения с валидацией (fail-fast)
  bot.ts        — Фабрика createBot()
  handlers.ts   — Обработчики сообщений и команд
  store.ts      — Хранилище в памяти с персистентностью в JSON-файл
tests/
  critical.test.ts  — Критические тесты (Node.js test runner)
```

```

- [ ] **Step 3: Verify**

Check: All markdown fences are closed, no broken formatting. Installation section still intact above.

- [ ] **Step 4: Commit**

```bash
git add README.md && git commit -m "docs: add development section"
```

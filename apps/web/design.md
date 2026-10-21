# Design System — PRODUCT (восстановлено по коду `website/`)

> Единая дизайнерская система, восстановленная по исходному коду сайта
> (`website/src/**` — Astro 7 + Starlight 0.42, `landing.css`, `theme.css`, `docs.css`,
> `dither.ts`, `anim.ts`, компоненты `site/` и `home/`).
> Документ нужен, чтобы новые проекты выглядели и строились **идентично** этому сайту:
> та же палитра, типографика, сетка, компоненты, пиксельная графика, анимации и т. д.
>
> Стиль общий для «семейства» продуктов (в коде упоминаются Apex, Simlock, Appduct и
> agent-device): **near-black + один акцент + световой гротеск для заголовков + uppercase
> mono для метаданных + квадратные углы + hairlines 1px + генерируемый дизеринг-пиксель-арт
> вместо фото и градиентов.**

---

## 1. Философия (7 принципов)

1. **Квадратные углы везде.** Радиусы запрещены глобально: `*, *::before, *::after { border-radius: 0 !important; }`. Скруглений не бывает: «мягкие» формы (иконки, смартфон) — ступенчатые пиксельные срезы, а не border-radius.
2. **Один акцент.** Только два состояния цвета: монохром (белый по серым ступеням на near-black) и **один** насыщенный розово-красный акцент. Акцент — для интерактива, метки «живого/выбранного», промпта `$`, выделения в заголовках (`<em>`) и пиксель-арта. **Статусы и ошибки никогда не берут акцент** (ошибки/500 — белый на тёмном, не красный).
3. **Hairline 1px, никаких теней.** Разделители — 1px линии с прозрачностью (`rgba(255,255,255,.08)` — слабые, `.16` — сильные). Эффекты глубины (`box-shadow`) не используются; выделение — заливкой (`--surface`), не тенью.
4. **Uppercase Geist Mono для «обслуживающего» текста.** Номера секций `[01]`, метки, чипы, кнопки, табы, подвал — только моно-капс с трекингом 0.08em. Основной текст и заголовки — Switzer.
5. **Светлые тонкие заголовки, плотный трекинг.** Weight 400–500, letter-spacing −0.035…−0.05em, line-height 1.0–1.1, `text-wrap: balance`. Акцент внутри заголовка — только через `<em>` (курсив выключен, цвет — акцент).
6. **Генерируемый пиксель-арт вместо изображений.** Фото и градиенты запрещены. Фон — canvas-сцены («кристаллы», «полосы»), дизерингованные Bayer'ом в 3 тона, на 12 fps. Иконки — битмапы 9×9. Логотип — «ступенчатый кристалл» 7×10.
7. **Честный контент.** Никаких выдуманных цифр/пользователей; всё фактическое, короткими предложениями, с точными командами. Хедлайн разбивается на два предложения, второе — акцентное.

Дополнительно: motion не обязан существовать — SSR-разметка всегда содержит «финальное состояние» сцены (читается без JS), а анимации — надстройка. `prefers-reduced-motion` всегда поддержан (дизеринг становится «стоп-кадром», виджеты не анимируются).

---

## 2. Палитра и токены

### 2.1 Тёмная база (лендинг, по умолчанию) — `landing.css :root`

```css
:root {
  color-scheme: dark;

  /* Типографика */
  --font-display: 'Switzer', Arial, sans-serif;
  --font-mono: 'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace;

  /* Поверхности */
  --bg: #0a0a0a;        /* фон страницы */
  --surface: #111111;   /* hover ячеек, выбранные строки */
  --field: #161616;     /* подложки чипов, inline-code, карт-превью */

  /* Линии */
  --line: rgb(255 255 255 / 0.08);        /* hairline по умолчанию */
  --line-strong: rgb(255 255 255 / 0.16); /* видимые рамки (окна, поля ввода) */

  /* Текст */
  --text: #ffffff;
  --muted: rgb(255 255 255 / 0.62);
  --faint: rgb(255 255 255 / 0.5);

  /* Акцент */
  --accent: #ff4f7b;
  --accent-hover: #ff9fb2;
  --accent-rgb: 255 79 123;   /* для rgba() в паттернах */
  --on-accent: #0a0a0a;       /* текст поверх акцента */

  /* Сетка и отступы */
  --frame: 75rem;
  --gutter: clamp(1rem, 3vw, 2rem);
  --pad: clamp(1.25rem, 3vw, 2.5rem);
  --rhythm: clamp(2.5rem, 6vw, 5rem);
  --label-tracking: 0.08em;

  /* Подсветка кода (сайтовые CodeBlock) */
  --code-fg: #e9e9e9;
  --code-kw: rgb(255 255 255 / 0.55);
  --code-str: var(--accent);   /* строки — акцентом */
  --code-fn: #ffffff;
  --code-num: var(--accent);
  --code-com: rgb(255 255 255 / 0.5);
  --code-punc: rgb(255 255 255 / 0.55);
  --code-type: #ffffff;
}
```

### 2.2 Ступени серого (для текстов)

| Токен | Значение | Where |
|---|---|---|
| `--text` | `#fff` | заголовки, активные/выбранные строки |
| `--muted` | `rgba(255,255,255,.62)` | основной текст, lede, метки в меню |
| `--faint` | `rgba(255,255,255,.5)` | номера, подписи, комментарии, статусные флаги |

Не «новая» серая переменная — только эти три. Появляется и тёмная плита `#1a1a1a` (`.btn--dark`, `.lockup-by`) и `#0d0d0d` (плитка ошибки).

### 2.3 Light-режим (только документация) — `theme.css`

Лендинг — всегда тёмный (`color-scheme: dark`, `theme-color #0a0a0a`). Docs-система поддерживает свет/тёмный через Starlight.

```css
:root[data-theme='light'] {
  --cs-brand: #d6204c;   /* более глубокий акцент: #ff4f7b слишком бледен на белом */
  --cs-on-brand: #ffffff;
  --cs-bg: #ffffff;
  --cs-fg: #000000;
  --cs-accent: #c2143f;
  --cs-muted: #636363;
  --cs-line: #00000024;
  --cs-line-soft: #00000014;
  --cs-wash: #00000004;       /* лёгкая подложка (hover-фон) */
  --cs-code-bg: #f6f6f5;
  --cs-code-fg: #1f1f1f;
  --cs-code-border: #dededb;
}
```

Тёмные значения: `--cs-brand #ff4f7b`, `--cs-accent #ff4f7b`, `--cs-muted #b4b4b4`,
`--cs-line #ffffff29`, `--cs-line-soft #ffffff17`, `--cs-wash #ffffff0a`,
`--cs-code-bg #111111`, `--cs-code-fg #ededed`, `--cs-code-border #ffffff26`.

> Правило: все токены, переопределённые для dark (`:root`), **обязательно** переопределяются для
> light, иначе тёмные значения «протекут» в светлую тему.

---

## 3. Типографика

### 3.1 Шрифты (self-hosted woff2, свободные лицензии)

| Семейство | Weights | Роль | Файл |
|---|---|---|---|
| **Switzer** (ITF Free Font License, fontshare) | 300 Light / 400 Regular / 500 Medium | заголовки, текст, вардмарк | `src/fonts/Switzer-*.woff2` |
| **Geist Mono** (SIL OFL 1.1) | 400 / 500 | моно-метки, код, таблицы, транскрипты | `src/fonts/GeistMono-*.woff2` |

`font-display: swap`. В `<head>` — `preload` трёх самых используемых: Switzer Medium, Switzer Regular, Geist Mono Regular.

### 3.2 Шкала

| Класс | Свойства |
|---|---|
| `.h1` | weight 500; `font-size: clamp(2rem, 1.3rem + 2.6vw, 3.5rem)`; `line-height: 1.08`; `letter-spacing: -0.035em`; `text-wrap: balance`; на hero ограничение `max-width: 16–17ch` и `margin-top: -0.18em` (подтягнуть капсы к краю) |
| `.h2` | weight 500; `clamp(1.75rem, 1.3rem + 1.6vw, 2.75rem)`; lh 1.1; ls −0.03em; balance; `max-width: 24ch` в `.intro` |
| `.h3` | weight 500; `1.125rem`; lh 1.3; ls −0.01em |
| `.lede` | `clamp(1rem, 0.95rem + 0.25vw, 1.125rem)`; lh 1.55; color `--muted`; `max-width: 40rem` |
| `.body` | `0.9375rem`; lh 1.55; color `--muted` |
| `.label` | mono; `0.75rem`; weight 400; `letter-spacing: var(--label-tracking: 0.08em)`; **uppercase** |

**Акцент в заголовке — только `<em>`:** `em { font-style: normal; color: var(--accent); }`
Шаблон заголовка: «Два предложения. <em>Второе — акцент.</em>»

**Inline-код в тексте:** padding `0.05em 0.3em`, bg `--field`, mono, `0.85em`, цвет `--text`.

### 3.3 Написание

- mono-метки — ВСЕГДА uppercase (даже ссылки-«more» и чипы) — tracking `0.08em` на лендинге, `0.055em`/`0.04em` в документации (тоже uppercase).
- Числа секций — ведущий ноль и квадратные скобки: `[01]`.
- Формат номера ячейки: `String(i + 1).padStart(2, '0')`.

---

## 4. Сетка, рамка, ритм, брейкпоинты

```css
/* Центральный столб с вертикальными hairlines на всю высоту страницы */
.frame {
  position: relative;
  width: min(100% - 2 * var(--gutter), var(--frame)); /* максимум 75rem */
  margin-inline: auto;
  border-inline: 1px solid var(--line);
}
```

- Всё содержимое — **внутри `.frame`** (и nav, и секции, и футер; фон sticky-nav — с шириной `frame`).
- Отступы: `--pad` (1.25→2.5rem) — например, для ячеек; `--rhythm` (2.5→5rem) — вертикальный ритм секций (`padding: var(--rhythm) var(--pad)` для `.intro`/`.split`).
- **Брейкпоинты: `64rem`, `48rem`, `30rem`** (в доксах ещё `52rem`, `40rem`). Сетка ячеек сворачивается:
  - `cells--4/5` → 2 колонки на `64rem`; все cells и splits → 1 колонка на `48rem`.

---

## 5. Компонентная система лендинга

### 5.1 Заголовок секции

```html
<p class="section-head label"><b>[01]</b> How it works</p>
```
```css
.section-head {
  display: flex; gap: 1.25rem; align-items: center;
  margin: 0; padding: 0.875rem var(--pad);
  border-block: 1px solid var(--line);   /* полная строка-разделитель */
  color: var(--muted);
}
.section-head b { font-weight: 400; color: var(--faint); } /* номер тусклее текста */
```

### 5.2 Вступление секции

```css
.intro {
  display: flex; flex-direction: column; align-items: flex-start; gap: 1.25rem;
  padding: var(--rhythm) var(--pad) clamp(2rem, 4vw, 3rem);
}
```
Внутри: `h2.h2` (+ `<em>`), часто `p.lede`. Вариант `intro--top` (плюс `padding-block: var(--rhythm)`) для страниц с h1.

### 5.3 Сетка ячеек (hairline table)

```css
.cells { display: grid; margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--line); }
.cells--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.cells--3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.cells--4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.cells--5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }

.cell {
  display: flex; flex-direction: column; gap: 0.875rem; min-width: 0;
  padding: var(--pad);
  border-bottom: 1px solid var(--line);
  border-right: 1px solid var(--line);
}
/* последний в строке — без правой границы (по числу колонок) */
.cells--3 > .cell:nth-child(3n) { border-right: 0; }
/* …аналогично 2n/4n/5n; на узких экранах сетка пересчитывается */

.cell .body { flex: 1; }
.cell-top { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; margin-bottom: 1.25rem; }
.cell--link { text-decoration: none; transition: background-color 120ms; }
.cell--link:hover { background: var(--surface); }
.cell-num { color: var(--faint); } /* «01» в ячейке */
```

Типовое наполнение ячейки-«фичи» справочника: `.cell-top`(метка/иконка/чип) → `h3.h3` → `p.body` → (`code.pkg` или `code.cmdline`) → опционально `span.label.more` (ссылка со стрелкой «→»).

### 5.4 Кнопки

```css
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 0.625rem;
  min-height: 2.5rem; padding: 0 1rem;
  border: 1px solid var(--accent); background: var(--accent); color: var(--on-accent);
  font-family: var(--font-mono); font-size: 0.75rem;
  letter-spacing: var(--label-tracking); text-transform: uppercase;
  text-decoration: none; white-space: nowrap; cursor: pointer;
  transition: background-color 120ms, border-color 120ms, color 120ms;
}
.btn:hover { background: var(--accent-hover); border-color: var(--accent-hover); }

.btn--dark { background: #1a1a1a; border-color: #1a1a1a; color: var(--text); }
.btn--dark:hover { background: #262626; border-color: #262626; }
```
Вторичная кнопка — `.btn--dark` (тёмная плита, не hairline). Внутри кнопок стрелку «→» — `<span aria-hidden="true">→</span>`.

### 5.5 Главная CTA-полоса

```css
.cta-bar {
  display: flex; align-items: center; justify-content: center; gap: 0.75rem;
  min-height: clamp(4.5rem, 9vw, 7rem);
  background: var(--accent); color: var(--on-accent);
  font-family: var(--font-mono); font-size: 0.875rem;
  letter-spacing: var(--label-tracking); text-transform: uppercase;
  text-decoration: none; transition: background-color 120ms;
}
.cta-bar:hover { background: var(--accent-hover); }
```
Ставится один раз, в самом конце страницы (см. `.finale`).

### 5.6 Чипы

```css
.chip {
  display: inline-flex; align-items: center; gap: 0.375rem;
  padding: 0.1875rem 0.4375rem;
  background: var(--field); color: var(--faint);
  font-family: var(--font-mono); font-size: 0.625rem;
  letter-spacing: var(--label-tracking); text-transform: uppercase; white-space: nowrap;
}
.chip--line { background: transparent; border: 1px solid var(--line-strong); color: var(--muted); font-size: 0.6875rem; padding: 0.375rem 0.625rem; }
.chip--agent { color: var(--accent); }        /* «AGENT»/«OFFICIAL»: семантический акцент текстом */
```

### 5.7 Командная строка и пакет

```css
.cmdline { font-family: var(--font-mono); font-size: 0.75rem; color: var(--text); overflow-wrap: anywhere; }
.cmdline .p { color: var(--accent); }        /* prompt «$» */

.pkg { color: var(--accent); font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.01em; overflow-wrap: anywhere; }
```

### 5.8 «Подробнее»-ссылка

```css
.more { color: var(--text); text-decoration: none; white-space: nowrap; transition: color 120ms; }
.more:hover, .cell--link:hover .more { color: var(--accent); }
/* формат: <span class="label more">Set up … <span aria-hidden="true">→</span></span> */
```

### 5.9 Split («текст — картина»)

```css
.split {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--pad); align-items: center; padding: var(--rhythm) var(--pad);
}
.split-copy { display: flex; flex-direction: column; align-items: flex-start; gap: 1.25rem; }
```

### 5.10 Band и Stage (поля под дизеринг)

```css
.band {
  position: relative; display: grid; grid-template-columns: minmax(0, 1fr);
  place-items: center; min-height: clamp(9rem, 18vw, 13rem);
  padding: 2rem var(--pad); border-top: 1px solid var(--line); overflow: hidden;
}
.stage { position: relative; padding: clamp(2.5rem, 7vw, 5.5rem) var(--pad); border-top: 1px solid var(--line); overflow: hidden; }
.band > :not(canvas), .stage > :not(canvas) { position: relative; } /* контент поверх canvas */
.dither { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; }
```

### 5.11 Табы

```css
.tab-bar { display: grid; grid-auto-columns: minmax(0, 1fr); grid-auto-flow: column; border-top: 1px solid var(--line); }
.tab {
  min-height: 3rem; padding: 0 0.5rem; border: 0; border-bottom: 2px solid transparent;
  background: transparent; color: var(--faint); cursor: pointer;
  transition: color 120ms, border-color 120ms;
}
.tab + .tab { border-left: 1px solid var(--line); }
.tab:hover { color: var(--text); }
.tab[aria-selected='true'] { color: var(--text); border-bottom-color: var(--accent); }
```
На `48rem` — горизонтальный скролл без скроллбара. Возможность клавиатуры: WAI-ARIA tabs pattern (←/→, см. `ConfigTabs`).

### 5.12 Финал

```css
.finale { margin-top: clamp(3rem, 8vw, 6rem); container-type: inline-size; }
.giant {
  margin: 0; padding: 7cqi 0 5cqi;
  font-weight: 500; font-size: 21.6cqi; /* слово = ширина рамки */
  line-height: 0.8; letter-spacing: -0.045em; text-align: center;
  color: var(--accent); white-space: nowrap; user-select: none;
}
```
Композиция финала: `.cta-bar` + `<p class="giant">PRODUCT</p>` (aria-hidden, translate="no").
На 404: `.finale` без cta-bar, только `.giant`.

### 5.13 Marquee (движущаяся строка)

```html
<div class="marquee" role="region" aria-label="Targets and bundlers">
  <p class="sr-only">Works with {items.join(', ')}.</p>
  <div class="track label" aria-hidden="true">
    <!-- список rendered дважды для бесшовного цикла -->
    <span class="run"><span class="item"><i></i>React Native</span>…</span>
    <span class="run">…</span>
  </div>
</div>
```
```css
.marquee { position: relative; overflow: hidden; border-top: 1px solid var(--line);
  mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent); }
.track { display: flex; width: max-content; animation: scroll 38s linear infinite; }
.marquee:hover .track { animation-play-state: paused; }
.item { display: inline-flex; align-items: center; gap: 0.75rem; padding: 1.125rem 1.5rem; color: var(--muted); white-space: nowrap; }
.item i { width: 6px; height: 6px; background: var(--accent); } /* акцентный «пиксель»-разделитель */
@keyframes scroll { to { transform: translateX(-50%); } }
```
Reduced motion: анимация отключена; один статичный ряд с теми же затемнениями краёв.

### 5.14 Терминальный текст (`.term`)

```css
.term { padding: 1rem; font-family: var(--font-mono); font-size: 0.8125rem; line-height: 1.75;
  color: var(--code-fg); white-space: pre-wrap; overflow-wrap: anywhere; }
.term .ln { min-height: 1.75em; }
.term .p { color: var(--accent); }      /* prompt / точка вызова ● */
.term .user, .term .tool { color: var(--text); }
.term .dim { color: var(--faint); }
.term .out { color: var(--muted); }
.term .ok { color: var(--accent); }
.term .k { color: var(--muted); }       /* JSON-ключи */
.term .s { color: var(--accent); }      /* JSON-значения */
```

### 5.15 DUCT — «канал передачи» между приборами

```css
.duct {
  --track: rgb(255 255 255 / 0.5);
  position: relative; flex: 1 1 4rem; max-width: 9rem; min-width: 3rem; height: 2.25rem;
  background: repeating-linear-gradient(90deg, var(--track) 0 4px, transparent 4px 8px) center / 100% 2px no-repeat;
}
.duct.is-live { --track: var(--accent); }   /* зажигается пока летит пакет */
.pkt { position: absolute; top: 50%; left: 0; width: 10px; height: 10px; margin: -5px 0 0 -5px; background: var(--accent); opacity: 0; }
.pkt--back { background: var(--text); }     /* ответный пакет — белый */
```

Вертикальный вариант (на `48rem` и в «дереве»): высота 2.25–3rem, ширина 2.25rem, пунктир вертикальный (см. `.duct--v`), пакет двигается по `top`.

---

## 6. Оконный хром и устройства

### 6.1 `Window` — универсальное окно

```html
<div class="window">
  <div class="window-bar">
    <span class="window-tag">Product</span>   <!-- акцентная бирка wordmark -->
    <span class="window-title">zsh</span>      <!-- mono 0.6875rem, faint -->
    <span class="window-controls" aria-hidden="true">✕ ─ □</span> <!-- 3 svg 9px, faint -->
  </div>
  <div class="window-body">…</div>
</div>
```

```css
.window { position: relative; display: flex; flex-direction: column; min-width: 0; background: var(--bg); border: 1px solid var(--line-strong); }
.window-bar { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--line); }
.window-tag { padding: 0 0.1875rem; background: var(--accent); color: var(--on-accent);
  font-family: var(--font-display); font-weight: 500; font-size: 0.625rem; line-height: 1.35; text-transform: uppercase; }
```

### 6.2 `DevTools.astro` — схема DevTools-окна с Product внутри

- Один `Window`, в нём: строка табов (`Console / Sources / Network / Memory` + активный таб `Product` — mono 0.625rem, `letter-spacing 0.06em`, активный с `border-bottom: 2px solid var(--accent)`); слева узкий сайдбар 7.75rem: бренд-написание (Mark 10px + текст 500) и список установленных плагинов; справа — `slot` с панелью.
- Выбранный плагин в сайдбаре: фон `--surface` + полоса `::before` 2px слева `--accent`. Список «скрывается» от выбранного элемента (от `selected - 2`), чтобы читалось как длинный список.
- Одна колонка `40rem`: все табы кроме первого и Product скрыты, sidebar — 6.25rem.

### 6.3 `Phone.astro` — пиксельный смартфон

- Пропорции `9 / 18.5`, ширина `--w` (по умолчанию 13.5rem, в hero — 11.5rem).
- **Углы — ступенчатый пиксель-срез `clip-path`** (сетка 4px, радиус 8px):
  ```css
  --steps: polygon(0 8px, 4px 8px, 4px 4px, 8px 4px, 8px 0, calc(100% - 8px) 0, /* …все 20 точек */);
  .device { background: #313131; clip-path: var(--steps); }
  .device::before { content: ''; position: absolute; inset: 1px; z-index: -1; background: #050505; clip-path: var(--steps); }
  ```
- Внутри: `.screen` (`#0d0d0d`), «island»-остров (чёрный 34%×12px), `app-bar` (заголовок слева, счёт-квадрат справа: mono 0.625rem, bg `--field`; при `count > 0` — `is-full`: bg `--accent`, color `--on-accent`), body — контент слота.

---

## 7. Пиксельная графика

### 7.1 Марка (`Mark.astro` + `MARK` в `icons.ts`): ступенчатый кристалл 7×10

```ts
export const MARK = [
  '...#...',
  '..###..',
  '..###..',
  '.#####.',
  '.#####.',
  '#######',
  '#######',
  '#######',
  '.#####.',
  '..###..',
];
```
- Рендер: **один SVG-path** из unit-квадратов (`M{x} {y}h1v1h-1z`), `viewBox="0 0 7 10"`, `shape-rendering: crispEdges`, `width = height * 7 / 10`, цвет — `currentColor`.
- Высота марки в UI — кратная 10px (обычно 20px), где важна «чёткость» ступеней.
- Для сцены кристаллов: `MARK_ROWS = [1, 3, 3, 5, 5, 7, 7, 7, 5, 3]` (ширина каждой из 10 строк).

### 7.2 Пиксельные иконки 9×9 (`PixelIcon.astro` + `icons.ts`)

- Битмап 9 строк по 9 символов (`#` — пиксель), рендер одним path, `viewBox="0 0 9 9"`, `currentColor`, `crispEdges`.
- Sizes: 18 или 27px; часто в акценте (`class="accent"`).
- Набор: `network, query, cube, signpost, database, gauge, faders, folder, flag, table, stack, flame, form, grid, panel, lock, code, test, package`.
- Правило: у иконок — квадратные «пиксели», никогда не «зализанные» сглаженные формы; вдохновение — пиксельные шрифты, а не Material.

### 7.3 Дизеринг-сцены на canvas (`dither.ts`)

**Механика:**
- Канвас заполняется 1 пиксель на ячейку; CSS растягивает с `image-rendering: pixelated`. Размер ячейки — `cell` (по умолчанию **2 CSS px**).
- Каждая ячейка — тон 0..1 от сцены; хранит **3-тональную палитру**: фон `(10,10,10)`, тёмная смесь акцента (30 % между фоном и акцентом), полный акцент.
- Переходы — **ordered dithering по матрице Bayer 4×4** (нормализованной), между соседними цветами.
- FPS — **12** (`1000/12`). Больше нельзя: на высокой частоте «пиксели» перестают читаться как пиксели (так в комментарии кода: *a deliberately low frame rate keeps the pixels reading as pixels*). Начальная фаза сдвинута случайно (±20 s), чтобы сцены не синхронизировались.
- Если `prefers-reduced-motion`: рисуется один стоп-кадр (t = 9 s — момент «блика» по кластеру).
- Canvas уходит в Web Worker через `transferControlToOffscreen` (совместимый браузер) или рисуется на странице; `ResizeObserver` пересоздаёт сцену по размеру, `IntersectionObserver` включает/выключает FPS-цикл. Инициализация — после `load` и только когда канвас близко к viewport (`whenNear`, 200px).

**Сцены:**

| Сцена | Описание | Где |
|---|---|---|
| `crystals` | «Друза» марки: ступенчатые кристаллы растут от нижнего края вокруг `focus` (0..1 по ширине), в тёмной «породе» с шумом; по диагонали ходит **блик**, по каждому кристаллу снизу вверх бегут **импульсы** | hero, welcome |
| `hollow` | То же, но **самый высокий кристалл «отсутствует»** — рисуется пунктирный контур «гнезда», блик вспыхивает на его проходе | 404 |
| `flow` | Мягкие полосы света, бегущие по шуму (fbm value-noise); яркость ограничена (~0.55), чтобы полосы оставались тёмно-малиновыми, с редкими акцентными пикселями на гребнях | фоны кода (`ConfigTabs`, `BuildYourOwn`) |

Ключевые параметры генерации `crystals`:
- Размер кристалла = `min(rows, cols * 0.8) / 10`, capped 28px на ступень (иначе «пиксель» перестаёт читаться).
- Состав: «постель» мелких кристаллов вдоль нижнего края (число растёт с аспектом), немного россыпных в верхнем поле, и **кластер из 13** средних с падением высоты к краям, самый высокий — в `focus`.
- Рендер сзади-наперёд (сорт по глубине), светлый ободок у каждого exposed-ступеня, тёмный зазор вокруг силуэта; тон: левая грань светлее (0.86), правая темнее (0.58), средняя линия = 0.5, верхняя кромка шага = 1, к основанию темнее ×(1 − 0.42v).

**API:** `<Dither scene="crystals" focus={0.5} cell={2} />` → `<canvas class="dither" data-scene data-focus data-cell aria-hidden>`.
Цвет акцента берется из computed `--accent-rgb` — сцена автоматически «перекрашивается» со сменой бренда.

---

## 8. Движок анимации (`anim.ts`, `lazy.ts`, `dither-host.ts`)

| Хелпер | Контракт |
|---|---|
| `sleep(ms)` | промис-пауза |
| `ghostLine(parent, text, cls, prefix)` | строка занимает место сразу, но невидима (`.is-pending` + span `.ghost`): регистрируется полной, чтобы **typeOut не переверстал** страницу. `type(speed = 28)` печатает по символам; `show()` выводит сразу (args перекрашиваются после показа). |
| `whenVisible(el, loop, still)` | под `IntersectionObserver`: крутит `async loop` **пока элемент на экране**; при `prefers-reduced-motion` один раз вызывает `still()`. |
| `sendPacket(duct, pkt, reverse, duration = 640)` | пакет летит по duct (10px квадрат), `easing: steps(16)` — «движение по пикселям», duct подсвечен (`is-live`) до прибытия. Вертикальность определяется автоматически (`clientHeight > clientWidth`). |
| `whenNear(el, start, margin = '200px')` | один `import()`/init при приближении к viewport |
| `hero`/`dither`-хосты | lazy: код анимаций запрашивается только когда секция входит в ±200px; canvas — после window `load` |

Обязательные правила:
1. SSR-разметка = финальное состояние сцены (для no-JS и SEO-описания); анимация начинается с «reset», который стирает и пере-игрывает.
2. Ни один анимационный скрипт не загружается на первом рендере hero (динамический import).
3. Всё под `prefers-reduced-motion` — статик, но корректное (финальный кадр).

---

## 9. ⭐ Главная страница — детальный разбор (`src/pages/index.astro`)

### 9.0 Каркас

```astro
<Site title={site.title} description={site.description} jsonLd={jsonLd}>
  <Nav />
  <main class="frame">
    <Hero />                                <!-- hero + сцена «одно приложение, два окна» -->
    <Marquee />

    <section id="how">…[01] How it works…</section>
    <section id="agents">…[02] Agents…</section>
    <section id="plugins">…[03] Official plugins…</section>
    <BuildYourOwn />                        <!-- [04] Build your own -->
    <section>[05] Safe by default</section>
    <section>[06] Beyond React Native</section>
    <Faq num="07" />                        <!-- [07] FAQ -->
    <Closing />                             <!-- cta-bar + гигантский вардмарк -->
  </main>
  <Footer />
</Site>
```

- Шаблон `Site.astro` задаёт `<head>` (charset, viewport, canonical, OG 1200×630, Twitter large, preload 3 шрифтов, JSON-LD через prop, `<link llms.txt>`) и `<body>` (фон `--bg`).
- **Все данные страницы — из `src/site/content.ts`** (текст, команды, списки плагинов, FAQ, чаты). Компоненты не содержат copywriting-строк «своих» — правки бренда делаются в одном файле.
- Каждый `<section>` — `aria-labelledby="…-title"`; заголовочный h2 имеет `id`.
- Каждая сложная сцена — `role="img"` + длинный `aria-label` с сюжетом («DevTools показывает … , в терминале агент …»).

### 9.1 Nav

```html
<header class="nav">
  <div class="frame nav-inner">
    <Lockup />                                   <!-- Mark + PRODUCT-плита + [by Callstack] -->
    <nav class="links" aria-label="Main">        <!-- Docs · Plugins · Agents · GitHub -->
      {links.map(a => <a class="label" href>{text}</a>)}
    </nav>
    <a class="btn btn--dark" href={docs.start}>Get started</a>
  </div>
</header>
```

```css
.nav { position: sticky; top: 0; z-index: 20;
  background: rgb(10 10 10 / 0.86); backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line); }
.nav-inner { display: flex; align-items: center; gap: 1.5rem; min-height: 3.75rem; padding-inline: var(--pad); }
.links { display: flex; gap: 1.75rem; margin-inline: auto; }
.links a { color: var(--muted); transition: color 120ms; }
.links a:hover { color: var(--text); }
@media (max-width: 52rem) { .links { display: none; } .nav-inner > .btn { margin-inline-start: auto; } }
```

**Lockup** (компонент лендинга и docs): `Mark` 20px (акцентный) в отступе справа 0.125rem → слово «Product» UPPERCASE на акцентной плите (Switzer 500, 1.125rem, padding 1px 5px) → чип `BY CALLSTACK` (bg `#1a1a1a`, mono 0.625rem, padding 4px 6px). Hover: плита → `--accent-hover`. `<span translate="no">`.

### 9.2 Hero — «See inside your running app. So can your agent.»

Два этажа:

**Этаж 1 — копия + терминал** (`.hero-top.hero-top--split`):
- сетка `minmax(0, 1fr) / 28.5rem`, `align-items: center`, `padding-block: clamp(2rem, 4.5vw, 3.75rem)`;
- слева: `h1.h1` `max-width: 16ch`: «See inside your running app. <em>So can your agent.</em>»;
- `p.lede` — одно предложение о том, что Product даёт панели DevTools вам и те же данные агенту;
- `.actions` — `flex, gap 0.75rem`: `a.btn` «Get started →» + `CopyCommand` (`npx <product>@latest init`);
- справа: `Window title="zsh"` c `.term` (font-size 0.6875rem) и 5 строк:
  ```
  $ npx <product>@latest init
  $ npm install -D @<product>/network-activity-plugin
  # for you: press j to open React Native DevTools    (dim)
  $ npx skills add <org>/<product> --skill <product>
  # for your agent: the product skill               (dim)
  ```
- На `64rem` правая колонка скрывается.

**CopyCommand** — поле команды с copy-кнопкой:
```css
.cmd { display: flex; align-items: center; gap: 1.5rem; width: min(100%, 36rem);
  padding: 0.625rem 0.625rem 0.625rem 1rem; background: var(--bg); border: 1px solid var(--line-strong); }
.cmd-text { mono 0.8125rem; overflow-x: auto; scrollbar-width: none; }
.cmd-prompt { color: var(--accent); margin-inline-end: 0.75rem; }   /* «$» */
.cmd-copy { padding: 0.375rem 0.625rem; border: 0; background: transparent; color: var(--muted); }
.cmd-copy:hover { color: var(--accent); }
```
Клик: «Copy» → (на 1.6 s) «Copied» / при отказе «Press ⌘C». В hero ширина 22rem.
Образец: `$ npx <product>@latest init`.

**Этаж 2 — сцена `.viz`** (нижняя часть hero, на всю ширину рамки):
- фон — `<Dither scene="crystals" focus={0.5} />` (кластер кристаллов по центру);
- контейнер `.rig` — `display: flex; align-items: center; justify-content: center; padding: clamp(2rem, 5vw, 3.5rem) var(--pad)`.
- слева направо: **DevTools → duct → Phone → duct → agent-Window**:
  - `DevTools selected="Network Activity"`: flex `1 1 24rem`, max-width 28rem, **height 16.5rem**; внутри панель `.pane.is-on.net` с `--cols: minmax(0, 1fr) 3rem 3.5rem`;
    - панель Network Activity: заголовочная строка `Request | Status | Time` (pane-head, mono 0.625rem uppercase `--faint`), затем строки: `GET /api/products 200 142 ms`, `GET /api/user 200 88 ms`, и **выбранная** `GET /api/cart 500 212 ms` (`is-picked`: bg `--surface` + 2px акцентная полоса слева);
  - duct с human-пакетом (`pkt`) — направление «прибор → приложение»;
  - `Phone title="Cart" count={2}` (в hero `--w: 11.5rem`) с двумя «экранами» (`.view`, fade 0.28s):
    - `home`: магазин (3 товара: Runner Low $120 art-a, Cotton Tee $32 art-b, Field Cap $24 art-c). Строки: арт-квадрат 1.5rem с **пиксельным паттерном** (art-a — акцентные точки radial-gradient 1px, art-b — белые точки, art-c — акцентные вертикальные полоски 1.5px), имя (0.6875rem), цена (mono 0.5625rem muted);
    - `cart`: **ошибка без акцента** — плита `.err` (bg `#0d0d0d`, border `--line-strong`, padding 0.625rem): label `ERROR` (0.5625rem faint) + «Couldn't load your cart.» (0.75rem). Красным статус не рисуем;
  - duct-агент с двумя пакетами: **pkt--call (белый, направление к приложению = вызов)** и **pkt (акцентный, обратно = ответ/данные)**;
  - `Window title="agent"`: `flex 1 1 22rem`, max-width 26rem, min-height 15rem; `.term` 0.6875rem/1.65 с транскриптом агента (см. ниже).

**Стили панелей** (`.pane`):
```css
.pane { position: absolute; inset: 0; display: none; flex-direction: column; font-family: var(--font-mono); font-size: 0.6875rem; }
.pane.is-on { display: flex; }
.pane-row { display: grid; grid-template-columns: var(--cols, 1fr); gap: 0.75rem; align-items: center;
  padding: 0.5rem 0.875rem; border-bottom: 1px solid var(--line); white-space: nowrap; }
.pane-row > * { overflow: hidden; text-overflow: ellipsis; }
.pane-head { color: var(--faint); font-size: 0.625rem; letter-spacing: var(--label-tracking); text-transform: uppercase; }
.pane .dim { color: var(--faint); } .pane .mut { color: var(--muted); }
.pane .live { color: var(--accent); } .pane .flash { background: var(--accent); color: var(--on-accent); }
.pane-row.is-picked { background: var(--surface); } .pane-row.is-picked::before { width: 2px; background: var(--accent); }
```

**Транскрипт агента** (`transcript.ts`, общий с анимацией):
```
> Why does the cart screen fail?                                        (user, typed)
● session · create                                                      (tool, call)
● network · listRequests {"limit":5}                                    (tool, call, colored args)
  GET  /api/cart  500  212 ms                                           (out)
● console · getMessages {"levels":["error"]}                            (tool, call)
  ERR  TypeError: Cannot read property 'price' of undefined            (out)
✓ /api/cart returns 500, and CartScreen reads items before they load.   (ok, typed)
```
Правила раскраски: строки пользователей — text; вызовы инструментов с **акцентной точкой ●**; аргументы JSON: ключи `--muted` (`.k`), значения/числа — акцент (`.s`), пунктуация `--faint`; «✓»-вывод — акцент (`.ok`).

**Сценарий анимации** (`hero.ts`, каноничный для всех «живых» hero):
1. `play()` стартует при попадании `.viz` в viewport; под reduced motion ничего не делает (SSR-состояние и есть финальный кадр).
2. `reset()`: показать `home`, снять все `is-on/is-picked` со строк, подготовить **ghost-строки** (терминал).
3. Тайминги (мс): `sleep 700` → (параллельно: два human-пакета, по одному на каждую строку `GET /api/products`, `GET /api/user`; одновременно «печатается» вопрос агента по 20 ms/символ) → `show(session · create)` → `agentCall()` → `show('cart')` + `toDevTools()` + `GET /api/cart is-on` + `sleep 500` → `reveal(listRequests)` → `agentCall()` + `reveal(out)` → `GET /api/cart is-picked` + `sleep 400` → `reveal(getMessages)` → `agentCall()` + `reveal(out)` → `reveal(✓)` (typed) → `sleep 3400` → **цикл повторяется, пока блок виден**.
4. Печать: для `user/ok` — 20 ms/символ; tool-строки — появляются целиком после 260 ms, затем аргументы перекрашиваются (`dimArgs` + `colorArgs`).
5. `agentCall()` = сначала **белый** пакет (вызов) → затем **акцентный** обратно (данные).

**A11y сцены:** `role="img"`, `aria-label` (полное описание сюжета: оба окна, одинаковый запрос, вывод). Важно: в SSR-разметке терминал уже содержит полный транскрипт — без JS текст читается.

**Адаптив:** `64rem` — колонки складываются (DevTools → Phone → терминал ↓), duct вертикальные `2.5rem`, `rig-devtools height: 14rem`, `--w: 9.5rem`; `30rem` — у панели Network сохраняются 2 колонки (`--cols: 1fr 2.75rem`, Time скрыт).

### 9.3 Marquee (под hero)

Список из `content.ts`: `React Native · iOS · Android · Expo · Metro · Re.Pack · React Native Web · Webpack · Lynx · rspeedy · React Native DevTools`.
Механика — см. §5.13. Весь ряд `aria-hidden`, для скринридеров — одна строка `sr-only`-текстом.

### 9.4 `[01] How it works`

1. `section-head`: `[01] How it works`.
2. `.intro`: только h2: «Set it up once. <em>You and your agent both use it.</em>»
3. `ol.cells--3` — три шага:
   | № | title | body | cmdline |
   |---|---|---|---|
   | 01 | Run init | «It detects Metro, Re.Pack or rspeedy, installs the right package and updates your bundler config.» | `$ npx <product>@latest init` |
   | 02 | Add plugins | «Each plugin adds a panel… Most also need a small hook in your app; its page has the line.» (inline-code) | `$ npm install -D @<product>/tanstack-query-plugin` |
   | 03 | Give your agent the skill | «The product skill teaches a coding agent…» | `$ npx skills add … --skill <product>` |
   Каждая ячейка: `.label.cell-num` (01/02/03) → `h3.h3` → `p.body` (inline code обрабатывается md()) → `code.cmdline` с акцентным `$`.
4. **`ConfigTabs`** — «выбери свой bundler»: равные табы по ширине (`tab-bar`), 4 таба:
   `Metro (metro.config.js, @<product>/metro)` · `Re.Pack (rspack.config.mjs, @<product>/repack)` · `Web (metro.config.js, @<product>/web, Experimental)` · `Lynx (lynx.config.ts, @<product>/lynx, Experimental)`.
   Под табами `.cfg-stage`: фон `Dither scene="flow"`, окно `Window` (`max-width: 46rem; margin: 0 auto clamp(2.5rem, 7vw, 5.5rem)`) с `CodeBlock` (`minLines={10}`); ниже — `.panel-foot` плита на всю ширину рамки (background `--bg`, border-top, padding 1rem var(--pad)): `code.pkg` + `span.body`(note) + `span.label.more` «Set up X →».
   Табы — WAI-ARIA (click + ←/→ стрелки, roving tabindex).

### 9.5 `[02] Agents`

1. `section-head` `[02] Agents`.
2. `.split`: слева `.split-copy`: h2 «The same runtime, <em>as tools your agent calls.</em>», `lede` (что агент читает), `a.label.more` «Product for Agents →»; справа `Window title="zsh"` → `CodeBlock agentCli` (`minLines={6}`) — реальные вызовы CLI:
   ```
   npx <product> agent session create
   npx <product> agent console call \
     --tool getMessages \
     --args '{"levels":["error"]}' \
     --session <session-id>
   ```
3. `Domains` — `cells--3`, 6 ячеек: пять встроенных доменов
   (`console`, `network`, `react`, `performance`, `memory`) и шестая «Yours»:
   - формат: `.cell-top` слева `code.pkg.dom` (имя домена; 0.8125rem), справа `chip` «Built-in» (у «Yours» — `chip--agent` «Yours», акцентный текст);
   - `p.body` — что показывает;
   - `p.tools.label` — список инструментов через ` · ` (например `getMessages · clearMessages`), **без uppercase** (переопределён), 0.6875rem, `--faint`, `overflow-wrap: anywhere`;
   - у «Yours» вместо tools — `span.label.more` «Add a tool →».

### 9.6 `[03] Official plugins` — PluginGrid

1. `section-head` `[03] Official plugins`; `.intro` с h2 и lede.
2. `ul.cells--4.plugin-grid` — **14 официальных плагинов + 2 «замыкающих» = 16 ячеек** (идеально делится на 4/2/1 колонку):
   - официальные: Network Activity, TanStack Query, Redux DevTools, React Navigation, Storage, Performance Monitor, Controls, File System, Feature Flags, SQLite, Expo Atlas, Require Profiler, React Hook Form, Overlay (порядок = по частоте использования);
   - ячейка: `li.cell-wrap` (несущие бордеры) → `a.cell.cell--link`: `.cell-top` — `PixelIcon size={27} class="accent"` имя из content; `h3.h3` имя плагина; `code.pkg` пакет; `p.body` описание панели; hover — фон `--surface`;
   - бордеры: `nth-child(4n)` без правой границы; `64rem` → каждая чётная (2 колонки); `48rem` → в одну колонку;
   - замыкающие: `Community plugins` (icon `package`, ссылка в директорию, `.more` «Browse the directory →») и `Your own` (icon `code`, ссылка на plugin-development, `.more` «Build a plugin →»); у них `h3` цвет `--text` (не muted).

### 9.7 `[04] Build your own` (BuildYourOwn.astro)

1. `section-head` `[04] Build your own`; `.intro` h2 «And the one you write, <em>for you and your agent.</em>» + lede.
2. `.stage.build-stage` с `Dither scene="flow"`; внутри «дерево» `.tree`:
   - сетка 2 колонки `repeat(2, minmax(0, 26rem))`, `column-gap: clamp(1.5rem, 4vw, 3.5rem)`, центр;
   - **верхняя строка на обе колонки**: окно `Window title="user-panel/react-native.ts"` с **двумя половинами файла** (`.halves`, между ними hairline): слева — app-side (`DevToolsPluginClient`, отвечают панели), справа — agent-side (`useProductPluginAgentTool`, регистрация tool). Код 0.75rem/1.6, wrap.
   - **вертикальные duct--v** под каждой половиной (2.25rem ширина);
   - **внизу слева** `DevTools selected="User Panel" extra={['User Panel']}` (height 14rem) — панель User Panel (`--cols: 4rem minmax(0,1fr)`; таблица Field/Value: id user-123, name John Doe, email john@example.com; ключи `.dim`);
   - **внизу справа** `Window title="agent"` c терминалом (5 строк: `> Who is signed in on the simulator?`, `● session · create`, `● @my-org/user-panel · get-user`, `  John Doe · user-123 · john@example.com`, `✓ John Doe is signed in.`);
3. `.build-foot` (flex между): `CopyCommand «npx <product> generate»` (24rem) + две `.more`-ссылки (Plugin development →, Agent-enabled plugins →).
4. **Анимация — одиночный проход** при появлении (один раз, без цикла): через `whenNear(..., '-30% 0px')`: `[data-half="panel"]` получает `is-hot` (bg `rgb(var(--accent-rgb)/0.1)`, transition `background-color .3s steps(3)`) + его duct `is-live`, через 1400 ms — переключение на agent-сторону, ещё 1400, снятие. Под reduced motion — ничего.
5. `48rem`: столбец — код сверху, duct, DevTools, терминал (`order`).

### 9.8 `[05] Safe by default`

- `section-head` `[05] Safe by default`; `.intro` h2 «Development only. <em>Nothing in production.</em>»
- `cells--4`, каждая ячейка: `.cell-top` с `PixelIcon 27 accent` (имена: `lock`, `test`, `faders`, `panel`) → `h3.h3` → `p.body` (в body inline-код: `enabled`, `WITH_PRODUCT=true`, `include`/`exclude`, `destroyOnDetachPlugins`).
- Тематика: Off until you turn it on / Nothing ships to users / Choose what loads / Panels keep their state.

### 9.9 `[06] Beyond React Native`

- `cells--3`, каждая ячейка — **ссылка** (`cell--link`):
  | pkg/cmd | chip | title | body |
  |---|---|---|---|
  | `@<product>/lynx` | Experimental | Product for Lynx | «The same panels, plugin catalogue and CLI for Lynx apps, through rspeedy.» |
  | `@<product>/web` | Experimental | Product for Web | «Your React Native Web app as a DevTools target, with the browser extension.» |
  | `$ npx <product> open` (cmdline) | — | Standalone app | «Just your plugin panels in their own window…» |
- Низ ячейки: `span.label.more` «Set up →».

### 9.10 `[07] FAQ` (`Faq.astro`)

- `section-head` `[07] FAQ`; **h2 — только для скринридеров** (`sr-only`), визуально FAQ открыт «как таблица»:
- `dl.cells--3`: 6 пар `dt.h3` (вопрос, weight 500) + `dd.body` (ответ; inline-`code` обрабатывается той же md()-функцией). Содержимое — только факты из документации.

### 9.11 Closing (финал) + Footer

```astro
<section class="finale">
  <a class="cta-bar" href={docs.start}>Get started <span aria-hidden="true">→</span></a>
  <p class="giant" aria-hidden="true" translate="no">PRODUCT</p>
</section>
```

Footer — одна строка: `© 2026 Product by Callstack` слева, mono-ссылки справа (`Docs`, `Plugin directory`, `llms.txt`, `GitHub`, `Discord`, `MIT license`, `Callstack`). `min-height 4rem`, `padding: 0.75rem var(--pad)`, `border-top`, hover → `--text`. Wrap на узких экранах.

### 9.12 JSON-LD (структурные данные главной)

`@graph`: `WebSite` (+ publisher `Organization` Callstack), `SoftwareApplication` (Product: category DeveloperApplication, OS «iOS, Android, Web», MIT, free), `SoftwareSourceCode`, `FAQPage` (вопросы из `faq`). OG-картинка одна общая (`/og-image.jpg`, 1200×630), текст сцены дословно в `site.ogAlt`.

### 9.13 Контракт данных (`src/site/content.ts`)

Единственный источник фактов для лендинга: `site` (имя, title, description, repo, discord, install, skill, ogAlt), `docs` (все пути), `marquee` (порядок важен — он фиксирован дизайн-системой), `plugins` (14 шт. с `icon: IconName`), `domains`, `code` (4 конфига + CLI), `faq`. Правило: **компоненты не пишут маркетинговый текст** — всё через content.ts (или props).

---

## 10. Остальные страницы

- **404** (`404.astro`): сцена `Dither scene="hollow"` (кластер с «отсутствующим» кристаллом, пунктир по контуру «гнезда») на всю высоту; поверх — `.nf-card` (bg `--bg`, border `--line-strong`, padding `--pad`, width `min(100% - 2*pad, 34rem)`): label `404 Page not found` (код «404» на акцентной плите), h1 `max-width: 14ch`, lede с путём, btn «Home →» + btn--dark «Docs». Затем «finale» без cta (только `.giant`). Мобильным: карточка сверху, сцена ниже.
- **welcome.astro** (внутренняя страница DevTools, noindex): тот же Nav; экран с центровкой, `Dither crystals focus=0.82`, карточка с Mark 40px, h1 «Product <em>loaded successfully.</em>», lede (вариант подбирается скриптом по `?withPluginsInstalled=true`), кнопки btn/btn--dark, `.more`-ссылка на форму фидбека. **Все ссылки открывают `_blank`** (страница живёт внутри DevTools).
- **plugin-directory** (`[...page].astro`): intro с `label.accent` + h1 («Panels for the libraries <em>your app runs on.</em>») + lede; `[01] Plugins` — `cells--3`, 12 на страницу: чипы `v1.2.3` и `chip--agent` «Official», имя = mono-пакет (`h2.h3` с переопределением: mono 0.9375rem, weight 400, ls 0), описание; низ ячейки: `.meta` (плита с border-top): `★ 1,234` + GitHub/npm ссылки; пейджер mono (`← Previous`, числа `01 02 …`, `Next →`, текущая — акцентная плита); `[02] Add yours` — 2 ячейки (`cell--link`).
- **OG-картинка** (`og/og.html` + `scripts/og.mjs`): статический HTML-шаблон 1200×630 скриншотится Playwright/Sharp в `public/og-image.jpg`; композиция выдержана в той же системе (dark, акцент, mono).

---

## 11. Docs-режим (Starlight)

### 11.1 Подключение

`astro.config.mjs → starlight({ customCss: ['font-face.css', 'theme.css', 'docs.css'], … })`.
`theme.css` — неслойный (unlayered), поэтому побеждает layered стили Starlight (правило: **все токены, заданные для dark `:root`, дублируются для `:root[data-theme='light']`**).

### 11.2 Токены и глобальные правила (`theme.css`)

- `--cs-font-display/--cs-font-mono` и маппинг на `--sl-font*`; `--sl-line-height-headings: 1.1`; **`--sl-shadow-sm/md/lg: none`**.
- Серые ступени Starlight переписаны (dark: white→#eeeeee→#d4d4d4→#9b9b9b→#6a6a6a→#2b2b2b→#141414→#0d0d0d→#0a0a0a; light — обратно: black→#111111→…→#f9f9f8→#ffffff).
- Акцентные: `--sl-color-accent(-low/high)` (dark: #3a0f1c / #ff4f7b / #ff9fb2; light: #fde4ea / #c2143f / #8f0f2f).
- Глобально: `border-radius: 0 !important`; `::selection` (brand bg + on-brand fg); `:focus-visible` (2px accent, offset 2px); всё `-webkit-font-smoothing: antialiased`.
- Header-контролы (theme select, search): mono 0.75rem uppercase `letter-spacing 0.04em`; search-кнопка — прозрачная с `1px --cs-line` рамкой (hover: accent), `kbd` — свои рамки без вложенных боксов.

### 11.3 Типографика и компоненты контента (`docs.css`)

- h1 страницы: weight **400** (не 500!), `clamp(2.5rem, 1.6rem + 3vw, 3.75rem)`, lh 1.02, **ls −0.05em**.
- h2: каждый блок секции проходит через `.sl-heading-wrapper.level-h2` с `margin-top: 2.5em; padding-top: 1.75rem; border-top: 1px hairline`.
- h5/h6: **mono uppercase** 0.8125rem ls .055em muted.
- strong `b`: weight 500, цвет белый.
- Ссылки: акцент; подчёркивание `1px`, `text-underline-offset: .2em`, подчёрк-цвет = mix(currentColor 45 %). Hover: подчёрк полный.
- Inline-код: 0.875em, padding .1/.35em, border `--cs-line-soft`, bg `--sl-color-bg-inline-code`.
- Таблицы: border-bottom строки; `th` — mono uppercase muted 0.75rem.
- Asides: `1px --cs-line` + **`3px` левая полоска** (note → brand, tip → gray-3); заголовок — mono-капс.
- Cards/LinkCards: hairline-рамки, прозрачный фон, hover: accent-борд + `--cs-wash`; иконки — акцент.
- Tabs/Toc (starlight): mono uppercase muted; активный таб — 2px полоса brand; TOC-текущий — accent.
- Steps: пули 1.75rem, mono, border `--cs-brand`, соединительная линия `--cs-line`.
- Sidebar: группы — mono uppercase 0.75rem ls .055em muted; вложенный список с `border-inline-start` hairline; активная ссылка — `--cs-wash` фон и **левый бордер group-строки становится brand** (`:has(> a[aria-current])`).
- Footer (starlight-обвязка): edit link и pagination остаются классическими, затем «brand strip» — mono uppercase line + ссылки.
- `SiteTitle` — тот же Lockup; `SocialIcons` — mono uppercase text-only ссылки (Plugins / GitHub ↗ / Discord ↗); `ThemeProvider` — сид «dark» для первого визита (localStorage), «Auto» хранит `""`.
- **Code-тема Expressive Code** (`ec.config.mjs`, 2 темы `<product>-dark`/`<product>-light`):
  - dark: bg `#111111`, fg `#ededed`, kw `#a3a3a3`, str `#ff4f7b`, fn `#ffffff`, num **`#ffc98a`** (тёплый, единственное «не-брендовое» значение — число), com `#8a8a8a` italic, punc `#9e9e9e`, type `#ffffff`;
  - light: bg `#f6f6f5`, fg `#1f1f1f`, kw `#595959`, str `#c2143f`, fn `#000000`, num `#9a4c19`, com `#6b6b6b`, punc `#666666`;
  - overrides: `borderRadius: 0`, `borderColor #ffffff26/#dededb`, шрифт Geist Mono 0.875rem lh 1.7, тени none, активная таб-полоса `#ff4f7b`, терминальная титулка `#0a0a0a`, `dots opacity .35` и т. д.
- Сайтовый `CodeBlock.astro` (лендинг): тема на CSS-переменных (`--code-*`), **нумерация строк `decimal-leading-zero`** (01, 02…), gutter 2rem, `min-height 1.75em` на строку; `minLines` добивает пустыми; `wrap` — строки переносятся под сдвиг gutter 4.25rem. JSON: keys = type-цвет (white), values = accent.

### 11.4 Docs-страницы

Markdown/MDX в `src/content/docs/docs/**`, `starlight-llms-txt` — генерирует `llms.txt` (ссылка есть и на лендинге, и в доксах — сознательный канал «для агентов»). 404 Starlight отключена (`disable404Route`) и заменяется собственной; `vercel.json` реврайтит неизвестные пути на `/404`; `trailingSlash: false`, сборка — файлами (`build/format: 'file'`).

---

## 12. SEO / статика / инфра

- `Site.astro`: canonical (с `build/format file` и `trailingSlash false` — без `.html` и слешей), OG/Twitter (1200×630, общая картинка), `theme-color #0a0a0a`, `color-scheme dark`, favicon SVG+PNG32+apple-touch, sitemap, `llms.txt` alternate, JSON-LD через `jsonLd`-prop.
- `astro.config.mjs`: `site`, `outDir ./build`, `build.format: 'file'`, `image.layout: constrained`, devToolbar off, sitemap с фильтром (не индексировать `/welcome`, `/plugin-directory/1`, 404).
- `vercel.json`: `trailingSlash: false`, `cleanUrls`, rewrite на `/404`.
- `welcome` — noindex; `plugin-directory/1` — canonical на `/plugin-directory`.
- Robots.txt — стандартный.

---

## 13. Чек-лист «сделать такой же проект» (с нуля)

1. **Каркас**: Astro + (для доков) Starlight. Структура `src/{layouts/Site.astro, styles/{landing.css, theme.css, docs.css}, fonts/{font-face.css, 5 woff2}, components/{site, home, starlight}, site/content.ts}`.
2. **Бренд-подстановка** (4 значения меняют всю «одежду»): `--accent`/`--accent-hover`/`--accent-rgb` (`#ff4f7b` → свой), имя в Lockup/Window-tag/giant/footer, `site/content.ts` (все факты/ссылки/списки), OG-картинка.
3. **Скопируй без изменений**: `landing.css` (вся сетка/компоненты), `theme.css`/`docs.css` (если есть docs), `Mark.astro`, `PixelIcon.astro` (перерисовать битмапы под свою семантику), `icons.ts` (bitmapPath), `dither.ts` (сцены можно оставить: «кристаллы» = логотип-паттерн), `anim.ts`, `lazy.ts`, `dither-host.ts`/`dither.worker.ts`, `Window.astro`, `CopyCommand.astro`, `CodeBlock.astro`, `Marquee.astro`, `Nav.astro`/`Footer.astro` (структурно).
4. **Сцены под бренд**: сцена `hollow` для 404 — «прореха» в товарном знаке; `focus` подбирается под позицию главного кластера на странице.
5. **Порядок шаблонов страниц**: собирается как композиция проверенных «этажей»: `Nav → (hero) → marquee → секции [01..NN] (section-head + intro + cells/split/stage/tab-bar) → finale (cta-bar + giant) → footer`. Каждая секция — минимум один визуальный «прибор» (окно/код/сцена) и максимум один акцентный элемент.
6. **Данные в content.ts**: выдуманных фактов нет. Текст заголовков: `Первое предложение. <em>Акцентное второе.</em>`
7. **A11y pass**: `aria-label` для всех role="img" сцен; `sr-only` дубли; `prefers-reduced-motion` для всех кастомных анимаций; фокусы — акцентные; `translate="no"` на бренд-строках.
8. **Аудит**: радиусов нет, теней нет, фото нет, второй акцент не появился, mono-метки все uppercase, hairline-толщина 1px везде.

### Быстрая шпаргалка цвета бренд-акцента

| Назначение | Значение |
|---|---|
| основной акцент | `#ff4f7b` |
| hover | `#ff9fb2` |
| текст на акценте (dark) | `#0a0a0a` |
| «бренд»/рамки (light docs) | `#d6204c` (on-brand `#ffffff`) |
| «текст-акцент» (light docs) | `#c2143f` |
| mix в дизер-палитре | 30 % акцента к фону |
| числа кода (dark) | `#ffc98a` |

---

## 14. Правила контента (копирайт)

- Короткие предложения; каждый абзац = один факт; без превосходных степеней и «революционности».
- Команды всегда точные и с версией/флагами (`npx <product>@latest init`).
- Чипы: `Experimental` (не «Beta»), `Built-in`, `Official`, `Yours`.
- Номера секций — `String(n).padStart(2, '0')`, в `[NN]`.
- Структура «more»-ссылок: глагол-императив + «→» после nbsp-пробела в `aria-hidden`.
- Тексты кнопок — императивы без пунктуации; один primary — «Get started» на CTA-полосе финала.

---

*Источник истины: файл `website/` (Astro 7.3, Starlight 0.42). Все значения выверены по коду 1:1. При расхождении с будущими правками кода — обновляйте этот документ.*

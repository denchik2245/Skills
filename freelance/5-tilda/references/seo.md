# SEO в рамках Tilda

Что можно настроить через MCP, что остаётся пользователю и как проверить. Все факты (адрес, телефон, часы, цены) берутся из макета или брифа. Если факта нет, оставь поле пустым и спроси, не выдумывай.

## Страницы

`update_page_settings` сохраняет форму целиком: незаданные поля стираются. Поэтому сначала `get_page_settings`, затем отправь все поля, которые нужно сохранить, вместе с новыми. `date` обязателен (`YYYY-MM-DD HH:MM`).

| Поле | Правило |
| --- | --- |
| `title` | до 60–65 символов: что, где, бренд — «Plume lounge — лаунж-бар в Набережных Челнах». На каждой странице свой |
| `descr` | 140–160 символов: предложение, факты, адрес или район, телефон; без перечисления ключевых слов |
| `meta_title`, `meta_descr` | только если для поиска нужен другой текст, чем для вкладки |
| `fb_title`, `fb_descr` | заголовок и описание для соцсетей, можно чуть живее |
| `alias` | латиница, коротко, по смыслу: `menu`, `thanks`, `privacy`; главная — пустой alias и `indexpageid` |
| `shorttitle` | название для меню и хлебных крошек |
| `link_canonical`, `fb_url` | итоговый адрес страницы. Если домен ещё сменится — напиши в отчёте, что их нужно обновить |
| `meta_keywords` | необязательно: поисковики почти не учитывают |

Через MCP нельзя загрузить картинку для соцсетей (og:image) — это делает пользователь: 1200×630, в настройках страницы.

## Содержимое страниц

- Ровно один `h1` на странице. Заголовки секций — `h2`, заголовки карточек — `h3` (`tag` текстового элемента). Конвертер ставит теги по имени текстового стиля; проверь `headings` в отчёте.
- У каждой содержательной картинки есть `alt`: что изображено, по-русски, без перечня ключевых слов («Кабинка за шторами в Plume lounge»). У декоративных картинок `alt` пустой. Имена файлов понятные (см. [images.md](images.md)).
- Текст — текстом, а не картинкой. Телефон — ссылкой `tel:`, почта — `mailto:`, внешние ссылки открываются с `linktarget: _blank`.
- У секций, на которые ведут кнопки, задан якорь (`rec_anchor`).

## Проект

| Что | Как |
| --- | --- |
| Название и описание сайта | `update_project_settings`: `title`, `descr` |
| Язык | `wslang` (`RU`) |
| Главная и 404 | `indexpageid`, `page404id` — с согласия пользователя |
| Фавикон | `get_favicons`, затем `update_project_favicons` с файлом логотипа из Figma (SVG или PNG) |
| robots.txt | `get_robots_txt`; ручной режим включай только при необходимости |
| sitemap.xml | `get_sitemap_xml`; «Спасибо» и служебные страницы не должны попасть в sitemap — правь через `update_project_sitemap_xml` |
| Структурированные данные | JSON-LD (`Organization`, `LocalBusiness` или точный подтип вроде `Restaurant`, `Store`, `MedicalClinic`) в head-коде главной: название, адрес, телефон, часы, гео, ссылка на карту — только реальные факты |
| HTTPS, www | `update_https_www_redirect_settings` — только когда подключён свой домен |
| Метрика, Search Console, Вебмастер | `yandexmetrikaid`, `meta_yandex_verification`, `meta_google_verification` — только коды, которые дал пользователь |
| llms.txt | по желанию: короткое описание бизнеса и страниц (`update_project_llms_txt`) |
| Скорость | [images.md](images.md), `fontsswap` |

Head-код страницы и проекта перед изменением прочитай (`get_head_code`) и сохрани всё, что там уже есть.

## Проверка

На опубликованной странице или в превью:

```js
({
  title: document.title,
  description: document.querySelector('meta[name=description]')?.content,
  og: [...document.querySelectorAll('meta[property^="og:"]')].map(m => m.getAttribute('property') + '=' + m.content),
  canonical: document.querySelector('link[rel=canonical]')?.href,
  h1: [...document.querySelectorAll('h1')].map(h => h.textContent.trim()),
  noAlt: [...document.querySelectorAll('.t396 img')].filter(i => !i.alt).length,
  jsonLd: document.querySelectorAll('script[type="application/ld+json"]').length,
})
```

- `title` и `description` такие, как задано; `h1` ровно один; картинок без `alt` нет, кроме декоративных.
- JSON-LD проходит проверку валидатором (validator.schema.org) — ссылку на него дай пользователю, сам туда страницу не отправляй.
- Открой `/robots.txt` и `/sitemap.xml` опубликованного сайта: страница «Спасибо» не в sitemap, нужные страницы есть.

## Только пользователь

og:image для каждой страницы, подключение домена, коды Метрики и вебмастеров, отправка сайта в Яндекс Вебмастер и Google Search Console.

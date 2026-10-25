# Аудит nsplaw.com — 25 октября 2026

Отчет: https://docs.google.com/spreadsheets/d/1hOwrA4v8grB-ohaWCCN3gD77NDIdrnhYNMvk2Dax290/edit

Пакет локальных доказательств. Публичные ссылки на эти файлы не создавались. Скриншоты фиксируют конкретные состояния; полноразмерные изображения открывайте с увеличением.

## Объем и ограничения

Выборочно: 18 страниц и экран 404; desktop 1440×900. Mobile 390×844: главная, контакты, «Споры», «Разблокировка активов», профиль партнёра, статья и вебинар. Дополнительно 360 px — услуга, 768 px — контакты. Проверены меню, слайдер, ссылки, переключение офисов, ввод в форму без отправки. Реальные заявки, получение писем, состояние успеха, внешние порталы целиком, аналитика, серверная безопасность и показатели скорости не проверены. Это не обход всех URL. Скриншоты — в отдельном локальном пакете, не по публичным ссылкам.

## Связь с замечаниями

### AUD-001 · P1

Первый экран показывает NSP и WE DO MORE на фоне гребцов, но не объясняет, что это адвокатское бюро, кому оно помогает и с какой задачей обратиться. На самом слайде нет действия для обращения.

Страница: https://nsplaw.com/

Условия: Desktop 1440×900; Mobile 390×844. Первый слайд, начало страницы.

- [25-home-clean-desktop.png](evidence/25-home-clean-desktop.png)
- [13-home-mobile.png](evidence/13-home-mobile.png)

### AUD-002 · P2

На проверенных услугах «Написать сообщение» открывает mailto, а встроенного перехода к форме обращения по этой услуге нет. Форма есть в контактах и профиле партнёра, но этот путь не предложен рядом с действием.

Страница: https://nsplaw.com/services/14/70 ; https://nsplaw.com/services/15/76 ; https://nsplaw.com/services/14/69 ; https://nsplaw.com/services/14/71

Условия: Desktop 1440×900 — четыре услуги; Mobile 390×844 — «Споры» и «Разблокировка активов».

- [02-disputes-desktop.png](evidence/02-disputes-desktop.png)
- [16-disputes-mobile.json](evidence/16-disputes-mobile.json)
- [17-assets-mobile.json](evidence/17-assets-mobile.json)

### AUD-003 · P2

Страницы показывают специализацию, цифры и кейсы, но не объясняют первый этап работы: какие исходные сведения нужны для оценки задачи, что клиент получит после первого обращения и как согласуется объем и стоимость помощи.

Страница: https://nsplaw.com/services/14/69 ; https://nsplaw.com/services/14/70 ; https://nsplaw.com/services/14/71 ; https://nsplaw.com/services/15/76

Условия: Desktop 1440×900. Полное содержимое четырех выбранных страниц услуг.

- [04-deals-desktop.png](evidence/04-deals-desktop.png)
- [05-private-capital-desktop.png](evidence/05-private-capital-desktop.png)
- [06-assets-desktop.png](evidence/06-assets-desktop.png)
- [02-disputes-desktop.png](evidence/02-disputes-desktop.png)

### AUD-004 · P2

Назначение полей указано только плейсхолдерами. После заполнения имени, email и вопроса видимые подписи исчезают: остаются только введенные значения.

Страница: https://nsplaw.com/contact

Условия: Desktop 1440×900; Mobile 390×844. Форма до и после ввода, без отправки.

- [03-contact-desktop.png](evidence/03-contact-desktop.png)
- [30-form-filled-mobile.png](evidence/30-form-filled-mobile.png)
- [30-form-labels.json](evidence/30-form-labels.json)

### AUD-005 · P2

У чекбокса согласия нет доступного имени: связанный label пуст, aria-label и aria-labelledby отсутствуют. Видимый текст согласия расположен отдельно и не задает имя элемента.

Страница: https://nsplaw.com/contact

Условия: Форма обращения, Mobile 390×844; DOM и дерево доступности. Без отправки.

- [30-form-labels.json](evidence/30-form-labels.json)
- [30-form-filled-mobile.png](evidence/30-form-filled-mobile.png)

### AUD-006 · P2

Почтовый адрес оформлен крупным жирным заголовком. На 390 px он разбивается примерно на восемь строк и занимает большую часть карточки; начало первого поля формы находится примерно на 1032 px от верха страницы.

Страница: https://nsplaw.com/contact

Условия: Mobile 390×844; дополнительная проверка 768×1024. Офис «Россия».

- [15-contact-mobile.png](evidence/15-contact-mobile.png)
- [29-contact-768.png](evidence/29-contact-768.png)

### AUD-007 · P2

Кнопка открытия мобильного меню — svg с role=button и tabIndex=-1. Она не входит в обычный порядок Tab. У элемента также нет aria-expanded, чтобы сообщать состояние меню.

Страница: https://nsplaw.com/ ; https://nsplaw.com/contact

Условия: Mobile 390×844. Закрытое и раскрытое меню, DOM кнопки открытия.

- [14-menu-mobile.png](evidence/14-menu-mobile.png)
- [30-form-labels.json](evidence/30-form-labels.json)

### AUD-008 · P2

Кликабельные точки слайдеров выполнены span без роли кнопки, доступного имени и tabindex. Стрелки рекомендаций — div без доступного имени. В обычном порядке Tab эти элементы управления не представлены.

Страница: https://nsplaw.com/

Условия: Desktop 1440×900; Mobile 390×844. Пагинация главного слайдера и блока рекомендаций.

- [13-home-mobile.png](evidence/13-home-mobile.png)
- [32-ratings-desktop.png](evidence/32-ratings-desktop.png)
- [39-carousel-controls.json](evidence/39-carousel-controls.json)

### AUD-009 · P2

Вебинар на 14 октября 2026 года по-прежнему представлен приглашением с действием регистрации. На проверенной странице не обозначено, что мероприятие уже прошло. Дата публикации 12 октября визуально предшествует фактической дате события.

Страница: https://nsplaw.com/press-center/events/658 ; https://nsplaw.com/press-center

Условия: Desktop 1440×900; Mobile 390×844. Проверка 25 октября 2026.

- [20-event-mobile.png](evidence/20-event-mobile.png)
- [20-event-mobile.json](evidence/20-event-mobile.json)
- [34-event-desktop.png](evidence/34-event-desktop.png)

### AUD-010 · P2

У рекомендаций показаны логотипы рейтингов, но рядом с цитатой нет года и ссылки на исходную публикацию. Например, у первой рекомендации с логотипом Chambers and Partners источник нельзя открыть из этого блока.

Страница: https://nsplaw.com/ ; https://nsplaw.com/company

Условия: Desktop 1440×900. Блок рекомендаций международных рейтингов.

- [32-ratings-desktop.png](evidence/32-ratings-desktop.png)
- [09-company-desktop.png](evidence/09-company-desktop.png)

### AUD-011 · P3

Часть цифр привязана к относительным периодам — последнему году или последним трем годам — без даты актуальности. По странице нельзя однозначно определить, за какие календарные периоды посчитаны результаты.

Страница: https://nsplaw.com/services/14/70 ; https://nsplaw.com/company

Условия: Desktop 1440×900; Mobile 390×844 — страница «Споры».

- [02-disputes-desktop.png](evidence/02-disputes-desktop.png)
- [16-disputes-mobile.json](evidence/16-disputes-mobile.json)
- [09-company-desktop.png](evidence/09-company-desktop.png)

## Проверено и не выдано за проблему

- На проверенных мобильных страницах шириной 390 px и услуге на 360 px горизонтальный скролл всей страницы не обнаружен.
- Переключение офисов России и ОАЭ обновляет адрес, телефон и текст обращения.
- Ссылка ru.nsplaw.com/press-center/news/590 перенаправляет на рабочую публикацию основного домена; битой ссылкой не считалась.
- Экран несуществующей страницы показывает сообщение 404 и сохраняет основную навигацию. HTTP-статус ответа отдельно не подтверждался.
- Выбранная услуга «Споры» открывается на английском и китайском. Полная лингвистическая экспертиза этих версий не проводилась.
- Отсутствие публичного прайс-листа не считалось самостоятельной ошибкой для индивидуальной юридической помощи.
- Недоступность robots.txt и sitemap.xml в инструменте чтения не выдана за ошибку сайта или запрет индексирования.

## Проверенные содержательные страницы

- https://nsplaw.com/
- https://nsplaw.com/services
- https://nsplaw.com/services/14/69
- https://nsplaw.com/services/14/70
- https://nsplaw.com/services/14/71
- https://nsplaw.com/services/15/76
- https://nsplaw.com/team
- https://nsplaw.com/team/7
- https://nsplaw.com/company
- https://nsplaw.com/contact
- https://nsplaw.com/analytics
- https://nsplaw.com/analytics/review/115
- https://nsplaw.com/press-center
- https://nsplaw.com/press-center/events/658
- https://nsplaw.com/en/services/14/70
- https://nsplaw.com/zh/services/14/70
- https://nsplaw.com/en/services/14/71
- https://nsplaw.com/press-center/news/590
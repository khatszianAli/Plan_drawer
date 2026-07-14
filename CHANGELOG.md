# Changelog

## v3.11

- Полностью разнесены HTML, CSS и JavaScript по зонам ответственности.
- Удалены inline-обработчики `onclick`; управление стало декларативным через `data-action` и `data-mode`.
- CSS разделён на tokens, base, layout, controls, components, utilities и responsive.
- Сохранена работа при прямом открытии через `file://`.
- Сохранено правило: первая обычная стена или веранда начинается с координат `(0, 0)`.

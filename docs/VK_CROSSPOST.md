# Кросс-постинг новостей в VK

При создании новости на сайте (кнопка «Опубликовать») запись также публикуется
на стену сообщества [kaoiii](https://vk.ru/kaoiii), если настроен токен.

## Что нужно на сервере (`/opt/spacepi/.env`)

```bash
VK_ACCESS_TOKEN=...          # user token (см. ниже)
VK_GROUP_SCREEN_NAME=kaoiii  # или VK_GROUP_ID=числовой_id
VK_CROSSPOST_ENABLED=true
PUBLIC_SITE_URL=https://poly-space.ru
```

После правки `.env`:

```bash
cd /opt/spacepi && docker compose up -d --no-deps --force-recreate api
# или полный ./deploy.sh после git pull
```

## Как получить токен (важно)

Нужен **пользовательский** access token аккаунта с правами **редактора** группы.
Community-токен из настроек группы постит только текст без фото.

1. Создайте приложение типа Standalone на https://dev.vk.com/apps  
2. Откройте в браузере (подставьте `APP_ID`):

```
https://oauth.vk.com/authorize?client_id=APP_ID&display=page&redirect_uri=https://oauth.vk.com/blank.html&scope=wall,photos,offline&response_type=token&v=5.199
```

3. Подтвердите доступ. В адресной строке `blank.html` скопируйте `access_token=...`  
4. Вставьте значение в `VK_ACCESS_TOKEN` на сервере.

Права `offline` делают токен бессрочным.

## Поведение в интерфейсе

- При создании новости — чекбокс «Опубликовать в группе VK»
- При редактировании — по умолчанию выключен; можно включить
- На карточке новости у редактора — кнопка «В VK» (ручной пост)
- Если токен не задан, чекбокс скрыт, сайт работает как раньше

Формат поста: заголовок, описание, текст + ссылка `https://poly-space.ru/news/{id}` и фотографии (до 10).

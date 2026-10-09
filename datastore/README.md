# Зібрані ціни

Цю папку щодня поповнює завдання «Збір цін» (`.github/workflows/scrape.yml`).

- `STATS.md` — свіжа статистика: що відстежуємо, які знижки показує магазин, зміни за добу,
  а після 14 днів історії — які знижки справжні.
- `prices/<дата>/<магазин>.jsonl` — товари й ціни за день, один товар на рядок.
- `runs/<дата>/<магазин>.json` — підсумок запуску: скільки зібрано, пропущено, помилки.

Ці файли — першоджерело. Базу з них можна зібрати наново будь-коли:

```bash
DATABASE_URL="file:./data/real.db" npm run db:init -w @znyzhky/api
DATABASE_URL="file:./data/real.db" npm run data:import -- "$PWD/datastore"
DATABASE_URL="file:./data/real.db" npm run data:report
```

Ціни взяті з публічних сторінок магазинів з дотриманням їхнього robots.txt.

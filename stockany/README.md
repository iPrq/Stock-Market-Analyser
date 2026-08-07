This is a basic [Next.js](https://nextjs.org) frontend for the FastAPI stock analysis backend in [app/main.py](../app/main.py).

## Getting Started

1. Start the FastAPI backend (default: `http://localhost:8000`):

```bash
uvicorn app.main:app --reload
```

2. In this `stockany` folder, run the frontend:

```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) and submit a ticker (for example `AAPL`).

## Backend URL

By default, the app calls `http://localhost:8000/api/analyze`.
To change it, set:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

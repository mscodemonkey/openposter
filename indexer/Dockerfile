FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv

COPY pyproject.toml ./
RUN python -c "import tomllib; p=tomllib.load(open('pyproject.toml','rb')); open('/tmp/requirements.txt','w').write('\\n'.join(p['project']['dependencies']))" \
  && uv pip install --system -r /tmp/requirements.txt

COPY openposter_indexer ./openposter_indexer

ENV PYTHONUNBUFFERED=1 \
    OPENPOSTER_INDEXER_DATA_DIR=/data \
    PORT=8090

EXPOSE 8090

CMD ["python", "-m", "openposter_indexer"]

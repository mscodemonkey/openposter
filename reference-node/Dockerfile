FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install uv (fast dependency installer)
RUN pip install --no-cache-dir uv

COPY pyproject.toml ./

# Install dependencies declared in pyproject.toml without requiring a lockfile yet.
RUN python -c "import tomllib; p=tomllib.load(open('pyproject.toml','rb')); open('/tmp/requirements.txt','w').write('\\n'.join(p['project']['dependencies']))" \
  && uv pip install --system -r /tmp/requirements.txt

COPY openposter_node ./openposter_node

ENV PYTHONUNBUFFERED=1 \
    OPENPOSTER_DATA_DIR=/data \
    PORT=8080

EXPOSE 8080

CMD ["python", "-m", "openposter_node"]

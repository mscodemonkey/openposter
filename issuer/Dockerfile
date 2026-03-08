FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv

COPY pyproject.toml ./
RUN python -c "import tomllib; p=tomllib.load(open('pyproject.toml','rb')); open('/tmp/requirements.txt','w').write('\n'.join(p['project']['dependencies']))" \
  && uv pip install --system -r /tmp/requirements.txt

COPY openposter_issuer ./openposter_issuer

ENV OPENPOSTER_ISSUER_DATA_DIR=/data
ENV OPENPOSTER_ISSUER_BASE_URL=http://localhost:8085
ENV OPENPOSTER_ISSUER_JWT_SECRET=dev-jwt-secret-change-me
ENV OPENPOSTER_ISSUER_JWT_ISSUER=openposter-issuer
ENV OPENPOSTER_ISSUER_JWT_EXP_SECONDS=31536000

EXPOSE 8085

CMD ["python","-m","uvicorn","openposter_issuer.app:app","--host","0.0.0.0","--port","8085"]
